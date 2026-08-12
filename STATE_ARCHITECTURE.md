# STATE_ARCHITECTURE.md

**Project:** Debate Analyser v2 · **Phase:** 3 · **Date:** 2026-07-05 · **Rank:** 4
**Binding:** `SYSTEM_ARCHITECTURE.md`, `API_SPECIFICATION.md`, `DATABASE_SCHEMA.md`, `USER_JOURNEYS.md`, `AI_ARCHITECTURE.md` (streaming/isolation), `05-DESIGN-SPEC.md`.
**Scope (from prompt):** submission · analysis-in-progress/streaming · results · history · error state. Covers **server-authoritative state** (`analyses.status` + `analysis_stage_runs`) and the **client state machine** that renders it. Server is truth; the stream is a live view (SYSTEM_ARCHITECTURE §2).

## 0. Principle
The **DB is the single source of truth**; the SSE stream is an optimization for latency (S12), never a separate truth. Any client state is reconcilable by `GET /analyses/{id}`. Uncertainty states (Insufficient/Contested) are **first-class**, equal-weight to findings (IA §3, NFR-17) — not error states.

---

## 1. Server-authoritative analysis lifecycle (`analyses.status`)
```
          POST /analyses (F1) ── S0 gate (F1a)
                                   │
                 rights_blocked ◀──┤ (no job; 422)   [terminal: not created as running]
                                   │ passed
                                   ▼
                             ┌──────────┐  enqueue
                             │  queued  │─────────────┐
                             └──────────┘             ▼
                                              worker picks up (SYSTEM_ARCHITECTURE §2)
                                   ┌────────────────────────────────┐
                                   ▼                                │ S1 running
                            ┌──────────────┐  transcript.ready      │
                            │ transcribing │────────────────────────┤
                            └──────────────┘                        │
                                   ▼ S2..S7 (+XA–XD), streaming      │
                            ┌──────────────┐  finding.batch events  │
                            │  analyzing   │────────────────────────┤
                            └──────────────┘                        │
             all stages ok  ▼                 ≥1 stage failed (isolated, NFR-15)
                     ┌──────────┐                 ┌──────────┐
                     │ complete │                 │ partial  │  (usable; failed stage flagged)
                     └──────────┘                 └──────────┘
             hard/unrecoverable failure before any usable output ▼
                                                          ┌──────────┐
                                                          │  failed  │  (honest, Retry)
                                                          └──────────┘
```
- **`partial` vs `failed`:** if *any* stage produced usable, gated findings, the analysis is **partial** (completed sections preserved, NFR-15 / HALLUCINATION_PREVENTION §8); `failed` only when nothing usable exists. A failed stage never emits a guess.
- Per-stage detail lives in `analysis_stage_runs` (S0–S10 each `pending→running→complete|failed|skipped`), enabling resume + S12 timing + observability.

## 2. Client state machine (renders server truth)
```
IDLE ──submit──▶ SUBMITTING ──201──▶ QUEUED ──SSE open──▶ STREAMING ⇄ (reconnect)
  ▲                  │ 4xx              │                     │
  │                  ▼                  │              finding.batch → incremental render
  └────────── SUBMIT_ERROR             │                     │
                                        └───────── analysis.done ─┬─▶ RESULTS (complete)
                                                                  ├─▶ RESULTS_PARTIAL (partial + Retry-failed-section)
                                                                  └─▶ ANALYSIS_ERROR (failed + Retry)
RESULTS ⇄ HISTORY (list/open)   ·   RESULTS ── contest/annotate/share/export ──▶ (optimistic, then reconciled)
```

### 2A. Submission state  *(F1/F1a; Journey E-INGEST)*
- **SUBMITTING:** validating envelope + running S0 gate.
- **Branches:** `rights_blocked` (422) → **SUBMIT_ERROR** showing the *specific* reason + alternative (F1a AC); `acceptable_use_required` (403) → consent prompt (`/me/consent`); `413/415` → format/size error with allowed list (F1 AC). No silent failure.
- On `201` → **QUEUED**, client opens `/analyses/{id}/stream`.

### 2B. Analysis-in-progress / streaming state  *(F8/NFR-14/S10/S12; Journey 1 step 4)*
- Client subscribes to SSE; renders **transcript first** on `transcript.ready` (the spine), then appends findings per `finding.batch{stage}` as each stage completes — user reads before the whole finishes (S12).
- **Per-stage progress** from `stage.status` events → accessible status messages (WCAG 4.1.3, NFR-12), never focus-stealing.
- **Optimistic nothing:** findings are only shown once server-gated (S9); the client never invents a placeholder finding.
- Confidence badges render from `confidence_band` only (XB); client never computes a band.

### 2C. Results state  *(F8/F13; results are read-mostly)*
- **RESULTS / RESULTS_PARTIAL:** 7 tabbed views over one analysis (IA §1); Evidence Drawer lazy-loads via `/findings/{fid}/evidence`.
- Interaction sub-states are **optimistic-with-reconcile**: contest (F9) flips the finding to `contested` locally then confirms via POST; annotation (F10) visibility/highlight toggles locally then persists; share/export create a job and poll. On server rejection → revert + error toast.
- **Insufficient / Contested / Unverified / Sources-disagree** render as equal-weight cards (NFR-17, RAG §6), not errors.

### 2D. History state  *(F11)*
- **HISTORY:** cursor-paginated list/search (`GET /analyses`); opening an item rehydrates RESULTS (or resumes a `partial`/`queued` one by re-opening the stream).
- **Resume:** a `partial`/interrupted analysis offers `POST /analyses/{id}/resume` (NFR-15) → returns to STREAMING from the last incomplete stage.

## 3. Streaming resilience & reconnection  *(NFR-14/15; SSE)*
- Each SSE event carries a monotonic `id`; on disconnect the client reconnects with `Last-Event-ID` and the server replays subsequent events from the pub/sub buffer (bounded) or the client falls back to `GET /analyses/{id}` for a full reconcile.
- Worker crash mid-stage → idempotent re-run of only the unfinished stage (`analysis_stage_runs.attempt`); already-streamed findings are not duplicated (dedupe by `finding.id`).
- Long analyses: the stream may outlive a single connection; reconnection is expected, not an error.

## 4. Error-state taxonomy (every failure has an honest, specific state — HALLUCINATION_PREVENTION §8)
| Error state | Trigger | User-facing behavior | Trace |
|---|---|---|---|
| **Ingest rights-blocked** | S0/F1a refusal | specific reason + alternative | F1a |
| **Ingest format/size** | 413/415 | allowed formats + retry | F1 |
| **Consent required** | 403 acceptable_use | consent flow | F1a/F14 |
| **ASR unclear** | S1 low-confidence/partial | "some audio was unclear" caveats on affected spans | F2/H4 |
| **Stage failed (isolated)** | one stage errors | that section = "couldn't be completed + Retry"; rest preserved → `partial` | NFR-15 |
| **No reliable source** | S6 no verified evidence | "Unverified — no reliable source found" | RAG §6/H5 |
| **Sources disagree** | only contested evidence | "Sources disagree" with each provenance | RAG §6 |
| **Injection detected** | XA flag | "suspicious instructions in the content were ignored" | F15/XA |
| **Analysis failed** | nothing usable | "analysis couldn't be completed + Retry"; no fabricated output | NFR-15/§8 |
| **Stream dropped** | connection loss | transparent reconnect / full reconcile | §3 |

*No error state fabricates content to fill a gap; completed sections always survive (NFR-15).*

## 5. Quality-Gate evidence (this doc)
- Submission, in-progress/streaming, results, history, and error states all specified with triggers + transitions. ✅
- Server-authoritative lifecycle (`analyses.status` + `analysis_stage_runs`) reconciles the client (§0–§3). ✅
- Streaming/resume matches async design + real latency (NFR-14/15, S12). ✅
- Uncertainty states are first-class, not errors (NFR-17). ✅

*End of STATE_ARCHITECTURE.md*
