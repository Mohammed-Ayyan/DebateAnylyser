# SYSTEM_ARCHITECTURE.md

**Project:** Debate Analyser v2 · **Phase:** 3 (Technical Architecture) · **Date:** 2026-07-05
**Decision-Hierarchy rank:** 4. Binding upstream: `00-RESEARCH.md` (1) · `PRODUCT_VISION.md` + Phase-01 (2/5) · `AI_ARCHITECTURE.md` + Phase-02 siblings (3). This document may not override any higher rank; a conflict is logged + amended (see `03-PHASE-COMPLETION.md`). None was found this phase.
**Sibling Phase-03 docs:** `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `STATE_ARCHITECTURE.md`, `SECURITY_MODEL.md`, `DEPLOYMENT_PLAN.md`, `SCALABILITY_PLAN.md`.

## 0. Conventions & grounding
- **Every service/boundary traces to a feature (F#), requirement (FR/NFR), or pipeline stage (S0–S10/XA–XD).** No component exists without an upstream driver.
- **Grounded facts vs. assumptions.** Claude model palette/pricing is grounded (`MODEL_SELECTION.md`, claude-api reference). Infrastructure categories chosen here (relational DB, queue, object store, cache) are **architecture decisions this phase is chartered to make**; where a *specific external vendor* is not yet decided it is flagged `[ASSUMPTION — Phase-03 procurement]` and left as an open ambiguity rather than invented (GLOBAL RULES). ASR vendor = **O-AI3**; RAG corpus sources = **O-AI1**.
- **The hard invariants from Phase 02 are enforced in code at this layer, not in prompts:** traceable-or-silent (S9), no aggregate score/winner, no person-level verdict (XD/FR-20), categorical calibrated confidence (XB), content-as-data segregation (XA), verified-attribution-before-citation (S6), abstain-on-insufficient.

---

## 1. Service boundaries (what runs where, and why)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CLIENT (SPA)  — the 7-tab Analysis Workspace (IA §1); streaming-aware   │
│  F8/F13/NFR-12/13. Holds NO trust decisions; renders server truth only. │
└───────────────┬───────────────────────────────┬─────────────────────────┘
        HTTPS (REST)                     SSE (read-only event stream)
                │                                 │
┌───────────────▼─────────────────────────────────▼───────────────────────┐
│  API SERVICE  (stateless, horizontally scalable)                         │
│  • AuthN/AuthZ (F14) • Ingest intake + rights gate call (F1/F1a/S0)      │
│  • CRUD: analyses, transcript, findings, sources (F8/F11)                │
│  • Contest (F9) • Annotation (F10) • Share/Export (F12) • Settings (F13/ │
│    F14) • SSE fan-out from pub/sub • Rate-limit + acceptable-use gate    │
└───────┬───────────────┬────────────────────┬───────────────┬────────────┘
        │ enqueue        │ read/write          │ pub/sub        │ signed URLs
        ▼                ▼                     ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌──────────────┐
│  JOB QUEUE    │ │ PRIMARY DB    │ │  CACHE / PUBSUB    │ │ OBJECT STORE │
│  (durable)    │ │ (relational)  │ │  (in-mem + TTL)    │ │ media/exports│
│  NFR-15/§14   │ │ DATABASE_     │ │  RAG cache, SSE    │ │ F1/F12/F14   │
│               │ │ SCHEMA.md     │ │  bus, rate buckets │ │              │
└───────┬───────┘ └───────▲───────┘ └─────────▲─────────┘ └──────────────┘
        │ consume          │ persist per stage  │ publish stage events
┌───────▼──────────────────┴────────────────────┴─────────────────────────┐
│  ORCHESTRATION / WORKER SERVICE  — runs S0→S10 as discrete, idempotent   │
│  stage tasks; isolates a failed stage (NFR-15); writes partial results;  │
│  publishes stage-complete events for streaming (S10/S12).                │
│    ├── LLM GATEWAY  → Claude API (caching, streaming, Batch) MODEL_SEL.  │
│    ├── ASR ADAPTER  → S1 transcription vendor  [O-AI3, vendor-agnostic]  │
│    └── RAG SERVICE  → retrieval (T1 index / T2 web / T3 fact-check) +    │
│                       NLI verification + credibility  (RAG_STRATEGY.md)  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why this split (alternatives rejected):**
| Boundary | Choice | Alternatives rejected | Driver |
|---|---|---|---|
| API vs. Worker | **Separate services** | Monolith running the pipeline in-request | Pipeline is minutes-long (ASR + multi-stage LLM on long context + network RAG, Research §14). A request thread cannot hold it → **async is mandatory** (NFR-14/15, S12). |
| Worker orchestration | **Code-orchestrated stage tasks** (not an autonomous agent) | LLM-driven agent loop | Phase-02 stance (`AI_ARCHITECTURE.md` §1/§3): narrow schema-validated stages for cost, latency, and risk isolation. |
| LLM access | **Central LLM Gateway** | Each service calling Claude directly | One place for key custody (SECURITY_MODEL), prompt-cache reuse, cost accounting (SCALABILITY), rate-limit/backoff, model-version pinning for rollback (DEPLOYMENT). |
| RAG | **Dedicated service** | Inline in worker | Retrieval + NLI verify has its own indexes, cache, and external network profile; isolating it bounds latency/cost and lets it scale independently (RAG §2 trade-off). |
| Client trust | **Zero client-side analysis logic** | Client computes bands/aggregates | All safety invariants (XB bands, S9 gate, XD) must be server-enforced; client renders only what the gate emitted. |

---

## 2. Sync vs. async invocation of the AI pipeline

**Rule: anything bounded by external model/ASR/retrieval latency is async; everything else is synchronous request/response.**

| Path | Mode | Rationale |
|---|---|---|
| Auth, settings, history list/search, open analysis, read findings/transcript, open Evidence Drawer, submit contest, create share, request export | **Sync** | Sub-second DB reads/writes; no model call in the request path. |
| **Core analysis (S0→S10), ASR (S1), RAG retrieval+verify (S6), export render, deletion propagation** | **Async (queued + streamed)** | Minutes-scale, retryable, resumable (NFR-15). Result is streamed as each stage/finding completes (NFR-14, S12). |

**Core analysis path — request flow (the critical path):**
```
1. POST /analyses (F1)                → API validates, runs S0 rights/acceptable-use gate (F1a).
                                          Blocked?  → 422 rights_blocked{reason, alternative}  (no job).
2. API creates Analysis(status=queued) → persists (DB), enqueues analysis job, returns {id, status}.
3. Client opens GET /analyses/{id}/stream (SSE)   → subscribes to pub/sub for this analysis.
4. Worker consumes job:
     S1 ASR ──▶ persist transcript segments ──▶ publish "transcript.ready"     (client renders spine)
     S2..S7 per stage ──▶ inter-stage validation gate (PROMPT_STRATEGY §1) ──▶ persist Findings/Sources
                        ──▶ publish "finding.batch" per stage    (STREAMING — first insight ≪ full done, S12)
     S6 RAG: check-worthy claims only ──▶ retrieve ──▶ NLI verify + licensing-quote (H1) ──▶ attach or drop
     XA/XB/XC/XD applied inline per Phase-02 stage rules.
     S8 synthesis (no winner/score, FR-10)  S9 citation-assembly HARD GATE (anchored-or-insufficient).
     Any stage fails ──▶ mark stage failed, ISOLATE, continue; Analysis → partial (NFR-15).
5. Worker sets status=complete|partial ──▶ publish "analysis.done".
6. Client may GET /analyses/{id} at any time for the authoritative full object (SSE is a live view, DB is truth).
```

**Streaming transport:** **Server-Sent Events** (one-way server→client) chosen over WebSockets — the stream is strictly server→client status/findings; SSE gives automatic reconnection with `Last-Event-ID` (resumable, STATE_ARCHITECTURE §3), works over plain HTTP/2, and needs no bidirectional channel. WebSockets rejected (bidirectional complexity unused here). Long-poll rejected (worse latency/overhead for S12).

**Idempotency & resume:** each stage task is idempotent and keyed by `(analysis_id, stage, attempt)` in `analysis_stage_runs` (DATABASE_SCHEMA). A worker crash re-runs only unfinished stages; `POST /analyses/{id}/resume` (F11/NFR-15) re-enqueues from the last incomplete stage. Completed-stage outputs are never recomputed (cost, §14).

---

## 3. Component responsibilities (traceability)

| Component | Owns | Traces to |
|---|---|---|
| **Client SPA** | 7-tab workspace, streaming render, categorical-confidence UI, Evidence Drawer, contest/annotation controls, accessibility (WCAG 2.2 AA) | F8/F9/F10/F13/F16, IA §1, NFR-12/13, `05-DESIGN-SPEC.md` |
| **API service** | AuthN/Z, ingest intake, S0 gate call, CRUD, SSE fan-out, rate-limit, acceptable-use, share/export/settings | F1/F1a/F8/F9/F10/F11/F12/F13/F14, `API_SPECIFICATION.md` |
| **Worker/Orchestrator** | S0–S10 execution, stage isolation/resume, streaming events, XA–XD application | `AI_ARCHITECTURE.md` S0–S10, NFR-14/15 |
| **LLM Gateway** | Claude calls, prompt caching, effort/model per stage, Batch, cost metering, key custody, backoff | `MODEL_SELECTION.md`, NFR-16 |
| **ASR adapter** | S1 transcription+diarization + confidence; vendor-agnostic interface | F2/S1, **O-AI3** |
| **RAG service** | T1/T2/T3 retrieval, NLI verify + licensing quote, credibility signals, cache/TTL | F6/F7/S6/S7, `RAG_STRATEGY.md`, **O-AI1** |
| **Primary DB** | Users, analyses, transcripts, findings, sources, contests, annotations, shares, stage runs, audit | `DATABASE_SCHEMA.md` |
| **Cache/PubSub** | RAG verify cache, prompt-cache coordination, SSE bus, rate-limit buckets | `SCALABILITY_PLAN.md` |
| **Object store** | Uploaded media, generated exports | F1/F12/F14 |

---

## 4. ASR & RAG integration contracts (advancing O-AI3 / O-AI1 without inventing a vendor)

Per GLOBAL RULES we do **not** assert a specific paid vendor's capabilities/pricing/SLA. Phase 03 fixes the **interface + selection criteria**; final vendor selection is a procurement/licensing action (cost + counsel input, carried as **O-TA1/O-TA2**).

- **ASR adapter contract (O-AI3):** input = media object + language hint; output must include **word-level timestamps, speaker diarization, per-segment ASR confidence, and diarization confidence** (required by S1 schema, H4). Selection criteria: timestamp+diarization support, confidence exposure, licensing/data-processing terms compatible with NFR-9, latency profile (§14), language coverage. Fallback path: secondary ASR vendor or **user-supplied transcript** (Journey fallback, `MODEL_SELECTION.md` S1).
- **RAG corpus contract (O-AI1):** T1 curated reference set + T3 fact-check feed are **licensed sources**; the architecture fixes tiering, retrieval interface, and the verification gate (RAG §4), leaving specific licensed feeds to procurement. T2 open-web retrieval uses a query-time retrieval interface. No specific source is asserted as authoritative (Research §6.1).

---

## 5. Non-goals / explicitly out of scope here (no invented scope)
- No multi-user org/roles service (F24 deferred) → AuthZ is owner + anonymous share-viewer only.
- No live/real-time ingest path (F20 deferred, locked #1) → analysis path is batch/upload-oriented.
- No billing/subscription service (not in any MVP feature).
- No API-for-researchers surface (F26 deferred).

## 6. Quality-Gate evidence (this doc)
- Frontend/backend/service boundaries defined with rationale + rejected alternatives (§1). ✅
- Sync vs. async explicitly decided and justified by **real pipeline latency** (§2). ✅
- Full request-flow diagram for the core analysis path (§2). ✅
- Every component traces to a feature/requirement/stage (§3). ✅
- Open vendor decisions advanced to contracts, not invented (§4; O-AI1/O-AI3 → O-TA1/O-TA2). ✅

*End of SYSTEM_ARCHITECTURE.md*
