# ROADMAP.md

**Project:** Debate Analyser v2 · **Phase:** 1 · **Date:** 2026-07-04
**Upstream (binding):** all Phase-1 documents + `00-RESEARCH.md`.
**Purpose:** phased plan aligned to the pipeline's Phases 02–08, with dependencies and a risk register. This is a *planning* artifact; it schedules the build phases, it does not perform them.

## 1. Pipeline phase alignment

| Pipeline Phase | Produces | Consumes (depends on) | Key gate |
|---|---|---|---|
| **02 — AI Architecture** | Analysis-engine design: model roles, calibration approach, retrieval/attribution-verification design, injection-defense design, reliability envelope + numeric targets | Phase 00, Phase 01 (esp. FR/NFR, F3–F7, F13, F15) | Reliability envelope set; NFR numeric targets (NFR-1/4/6/14) defined |
| **03 — Technical Architecture** | System/data architecture, the `Analysis/Transcript/Finding/Source/Contest` schema (IA §4), pipeline/streaming design, storage/retention design | Phase 02; IA; REQUIREMENTS | Schema covers every IA object; streaming + partial-resume designed |
| **04 — Feature Specifications (detailed)** | Detailed specs per feature F1–F16 (behaviors, states, edge cases) | Phase 03; FEATURE_SPECIFICATION; USER_JOURNEYS | Every MVP feature fully specified incl. failure paths |
| **05 — Design/UX** | Wireframes/visual design for the workspace, confidence display, Evidence Drawer, accessibility | Phase 04; IA; NFR-12/13 | WCAG 2.2 AA design review passes |
| **06 — Build** | Implementation of MVP features | Phases 02–05 | Feature acceptance criteria met |
| **07 — QA / Safety / Eval** | Test + audit suites: calibration (S4), fabrication (S2), injection (S10), named-person adherence (S11), accessibility | Phase 06; SUCCESS_METRICS; REQUIREMENTS | Launch gates (S2, S10, S11) pass |
| **08 — Launch/Release** | Release, monitoring of NSM + supporting metrics, contestation workflow live | Phase 07 | All hard launch gates green |

## 2. Product delivery stages (mapped onto build)

### Stage A — MVP (primary personas M + O; secondary P + D served)
**Features:** F1, F1a, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14, F15, F16.
**Rationale:** this is the complete uncertainty-first, traceable analysis core for uploads/URLs. It is the smallest set that delivers the thesis and serves the primary personas end-to-end (Journeys 1–4) without a scope violation.

### Stage B — Phase-2 expansion (roadmap, post-MVP)
F20 (live), F21 (Walton), F22 (debater rubric packs), F23 (journalist workbench), F24 (classroom workspaces), F25 (cross-debate comparison), F26 (researcher API), F27 (multilingual).
**Sequencing principle:** prove the core (Stage A metrics healthy) before leaning into the weakest-tech/highest-risk expansions (F23 journalist, per Research §17), and before the hardest-performance expansion (F20 live, Research §14).

## 3. Dependency graph (critical path)
```
Phase02 (AI arch + reliability envelope)
   └─> Phase03 (schema + streaming/storage)
          └─> Phase04 (detailed specs)
                 └─> Phase05 (UX/accessibility design)
                        └─> Phase06 (build MVP F1–F16)
                               └─> Phase07 (calibration/fabrication/injection/named-person/a11y audits)
                                      └─> Phase08 (launch + metric monitoring)
```
Hard cross-dependencies:
- F6/F7 (evidence/credibility) depend on Phase-02 **attribution-verification** design (NFR-3/4).
- F13 (confidence) depends on Phase-02 **calibration** design (NFR-1).
- F15 (injection) depends on Phase-02 **injection-defense** design (NFR-6).
- All numeric NFR targets are a Phase-02/07 deliverable (blocks Stage-A launch gates).

## 4. Risk Register

| ID | Risk | Source | Likelihood | Impact | Mitigation | Owner phase |
|---|---|---|---|---|---|---|
| RK-1 | Fallacy/structure false positives damage trust & risk defamation | §5.3, §13 | High | High | Precision-over-recall (NFR-2), contestability (F9), "possible/contestable" framing (NFR-18), higher bar for named people (FR-20) | 02, 04, 07 |
| RK-2 | Fabricated/unsupported citations break core value | §6.2, §15 #1 | High | High | Resolution-check every citation (NFR-4, F6 AC), traceable-or-silent (NFR-3) | 02, 06, 07 |
| RK-3 | Over-confident presentation induces over-reliance | §10, §7 | Medium | High | Categorical calibrated confidence (F13/NFR-1/5), no aggregate score (FR-10) | 02, 05, 07 |
| RK-4 | Prompt injection via submitted content | §12 | High | High | Content-as-data segregation (F15/NFR-6), continuous red-team (S10) | 02, 06, 07 |
| RK-5 | Defamation/harassment via named-person labeling | §13, §12 | Medium | Critical | No person-level verdicts (FR-10/20), contestation (F9), acceptable-use gate (F1a), disclaimers (NFR-8) | 01(done), 02, 07 |
| RK-6 | Legal specifics unverified (GDPR/CCPA/DSA/AI-Act/YouTube ToS/§230) | §13 **[UNVERIFIED]** | High | High | Counsel verification before build; assume unprotected (NFR-10); prefer official APIs (NFR-11) | 02/03, pre-06 |
| RK-7 | Live-analysis latency/cost under-scoped | §14 | Medium | Medium | Deferred to Phase-2 (F20); streaming-first MVP (NFR-14) | 02, Stage B |
| RK-8 | ASR/diarization errors → misattributed quotes | §15 #4 | Medium | High | Confidence surfacing (FR-3), caveat inheritance on low-confidence spans | 02, 06 |
| RK-9 | Arg-mining generalizes poorly on real debate audio | §3.1 | Medium | Medium | "unclear structure" state (FR-6), reliability envelope (Phase 02) | 02, 07 |
| RK-10 | Personas are unvalidated hypotheses | §9 (flagged) | Medium | Medium | User research before/within Phase 04; Open Ambiguity O-P1 | 04 |
| RK-11 | Numeric targets unset could slip launch gates | this doc §3 | Medium | Medium | Make targets a Phase-02 deliverable; launch gates depend on them | 02, 07 |
| RK-12 | Cost/rate-limits on multi-stage long-context analysis | §14 | Medium | Medium | Architecture cost-bounding (NFR-16), rate-limiting | 02, 03 |

## 5. Sequencing guardrails (from Decision Hierarchy)
- No later phase may silently override Phase 00/01 decisions; conflicts are logged + resolved up-hierarchy + recorded as an amendment (per GLOBAL RULES).
- Stage-A launch is gated on S2 (fabrication ~0), S10 (injection containment), S11 (named-person adherence 100%) — the three hard safety gates (`SUCCESS_METRICS.md` §3).

*End of ROADMAP.md*
