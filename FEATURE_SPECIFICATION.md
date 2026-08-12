# FEATURE_SPECIFICATION.md

**Project:** Debate Analyser v2 · **Phase:** 1 (inventory-level) · **Date:** 2026-07-04
**Upstream (binding):** `00-RESEARCH.md`, `PRODUCT_VISION.md`, `USER_PERSONAS.md`, `USER_JOURNEYS.md`, `INFORMATION_ARCHITECTURE.md`.

## 0. Conventions
- **Status:** `MVP` / `Phase-2` (post-MVP, on roadmap) / `Rejected` (with rationale). Every status has a rationale.
- **Traceability rule (Quality Gate):** every **MVP** feature names ≥1 persona need it serves. Persona keys: **M**=Marcus (learner), **O**=Ortega (educator), **P**=Priya (debater), **D**=Dana (journalist).
- Each feature lists: Purpose · Business value · User value · Dependencies · Risks · Alternatives · Acceptance criteria (AC).
- Feature IDs (F#) are referenced by `USER_JOURNEYS.md` and `REQUIREMENTS.md`.

---

## MVP FEATURES

### F1 — Multi-format Ingest (upload + URL + paste) — `MVP`
- **Purpose:** accept audio/video/text-file upload, YouTube/web URL, and pasted transcript/text. (Live excluded — locked #1.)
- **Business value:** the multimodal front door is the core differentiator vs. text-only competitors (Research §8).
- **User value:** M/O/P/D — all four personas start here (Journeys 1–4).
- **Dependencies:** F1a (rights/ToS check), F2 (transcription) for A/V.
- **Risks:** YouTube ToS / copyright on URL ingest (Research §13 — **[UNVERIFIED]**, must verify before build); large-file handling (Research §14).
- **Alternatives considered:** uploads-only (rejected as MVP — removes the URL use case central to Marcus); full live (deferred, locked #1).
- **AC:** supported formats listed pre-submit; oversized/unsupported inputs rejected with a clear message + alternative (Journey E-INGEST); URL ingest runs F1a before fetching; no ingest proceeds silently on failure.

### F1a — Rights/ToS & Acceptable-Use Gate — `MVP`
- **Purpose:** before URL fetch and at upload, check rights/ToS constraints and present acceptable-use terms (no harassment/"win-against-a-person" use, Vision §4 #7).
- **Business value:** legal risk reduction (Research §13); protects the brand.
- **User value:** O/D especially (institutional/professional accountability).
- **Dependencies:** `/legal` content; F1.
- **Risks:** over-blocking legitimate content; ToS specifics **[UNVERIFIED]** pending verification.
- **Alternatives:** none at MVP (skipping it is unacceptable given §13).
- **AC:** private/blocked/ToS-restricted URLs are refused with explanation + alternative; acceptable-use acknowledged before first analysis; blocked reasons are specific, not generic.

### F2 — Transcription + Speaker Diarization (with confidence) — `MVP`
- **Purpose:** convert A/V to time-coded, speaker-labeled transcript; expose transcription/diarization **confidence**.
- **Business value:** enables all downstream analysis on non-text input; confidence surfacing is a trust differentiator.
- **User value:** M/O/P/D (Journeys 1–4); P especially for fast/overlapping speech.
- **Dependencies:** F1.
- **Risks:** ASR errors and diarization uncertainty → misattributed quotes (Research §15 #4); ASR latency (Research §14, **[UNVERIFIED]** benchmark).
- **Alternatives:** transcript-only product (rejected — kills the multimodal moat); hide confidence (rejected — violates uncertainty-first thesis).
- **AC:** transcript is time-coded and speaker-labeled; low-confidence spans are visibly marked; downstream findings on low-confidence spans inherit a reliability caveat (Journey 1 E-ASR).

### F3 — Claim Extraction — `MVP`
- **Purpose:** identify individual claims (and check-worthy claims) with transcript anchors.
- **Business value:** foundation of the analysis; the primitive competitors expose only partially (Research §8, §2.1).
- **User value:** M (see the claims), D (check-worthy list), O (teaching material).
- **Dependencies:** F2/F1, transcript anchors (IA §4).
- **Risks:** argument-mining generalizes poorly across domains (Research §3.1) → missed/spurious claims.
- **Alternatives:** none for MVP; this is foundational.
- **AC:** each claim links to its exact transcript span; claims carry categorical confidence; when extraction is uncertain, it is marked, not fabricated (Journey invariant #1).

### F4 — Evidence & Support Assessment — `MVP`
- **Purpose:** for each claim, assess whether the *speaker* provided support and how strong it is (weak/absent/present) — distinct from external fact-checking (F6).
- **Business value:** "is this argument actually supported?" is the core learner question (Vision §1).
- **User value:** M (spot weak evidence), P (weak-evidence flags on practice rounds).
- **Dependencies:** F3.
- **Risks:** conflating "unsupported in this text" with "false" — must be clearly separated from F6 to avoid over-claiming (Research §15).
- **Alternatives:** merge with fact-checking (rejected — dangerously conflates "no support given" with "untrue").
- **AC:** each assessment distinguishes *support present/absent/weak* from *factual truth*; anchored + confidence-tagged; "insufficient evidence" state available.

### F5 — Argument Structure Map (Toulmin) — `MVP`
- **Purpose:** map claim → data/grounds → warrant (incl. implicit) → backing → qualifier → rebuttal (Research §3.2).
- **Business value:** unique integrated structure view; differentiator vs. fact-only tools.
- **User value:** P (structure/implicit-warrant detection — her top need), O (teaching structure), M (see how an argument is built).
- **Dependencies:** F3, F4.
- **Risks:** inventing structure the speaker didn't make (Research §3.1, §15 #6).
- **Alternatives:** Walton schemes as primary (deferred to Phase-2 — richer but heavier; Research §3.3); freeform summary (rejected — loses the pedagogical scaffold).
- **AC:** every mapped node anchors to a span; implicit/inferred nodes are visibly marked as inferred with lower confidence; "unclear structure" shown instead of fabrication (Journey 3 E-LOWCONF).

### F6 — External Evidence Retrieval + Provenance — `MVP`
- **Purpose:** for check-worthy factual claims, retrieve external sources and present them **with provenance and contestation**; verify attribution (locked #4; Research §6.2).
- **Business value:** traceability is the trust moat (Vision §5).
- **User value:** D (sourced check-worthy claims), M (where to verify), O (teachable evidence).
- **Dependencies:** F3; citation-integrity check (see AC / S2).
- **Risks:** fabricated/unsupported citations (Research §6.2 ~51.5%, §15 #1); retrieval failures / only-contested sources (Research §6.1, §2.3).
- **Alternatives:** curated-corpus-only (deferred consideration; locked #4 chose retrieval + provenance); assert verdicts (rejected — §13, §15).
- **AC:** every citation is resolution-checked (unresolvable → dropped + flagged, never shown as real); each source shows provenance; "no reliable source found → unverified" state exists; claims are never labeled true/false about a person (locked #3).

### F7 — Source Credibility Signals (with contestation) — `MVP`
- **Purpose:** present credibility signals for external sources, always with provenance and known contestation; never as neutral ground truth (Research §6.1).
- **Business value:** differentiator + risk mitigation.
- **User value:** D (defensible credibility), O (teach source evaluation), M (learn to weigh sources).
- **Dependencies:** F6.
- **Risks:** presenting a contested rater as authoritative (Research §6.1); rater bias controversy.
- **Alternatives:** single credibility score (rejected — implies false neutrality, §6.1); omit credibility (rejected — D/O need it).
- **AC:** every credibility signal shows its source/method and a contestation note; no signal is displayed as objective truth; "sources disagree/contested" state exists (Journey 2 E-EVIDENCE).

### F8 — Analysis Workspace & Report (streaming, tabbed) — `MVP`
- **Purpose:** the seven-view workspace (IA §1) that renders findings incrementally, each with anchor + categorical confidence + Evidence Drawer.
- **Business value:** the product surface; where the NSM value moment happens (`SUCCESS_METRICS.md` §1).
- **User value:** M/O/P/D (all journeys converge here).
- **Dependencies:** F2–F7; F13 (confidence display); IA.
- **Risks:** density overwhelming non-experts (Research §11); over-confident presentation (Research §10).
- **Alternatives:** single scrolling report (rejected — loses cross-referencing); PDF-only output (rejected — kills interactivity/NSM).
- **AC:** findings stream in with accessible status messages (WCAG 4.1.3); every finding is anchored + confidence-tagged; Evidence Drawer opens to show why + sources; no winner/overall-verdict is shown (Vision §4 #1).

### F9 — Contest / Feedback on any Finding — `MVP`
- **Purpose:** let any user challenge a finding; mark it contested; log for review (S5/S6).
- **Business value:** core defamation/abuse mitigation + model-improvement signal (Research §12, §13).
- **User value:** P (correct wrong flags), D/O (accountability), M (engagement/learning).
- **Dependencies:** F8.
- **Risks:** contest flow ignored → mitigation is theatre (S6 guards this).
- **Alternatives:** thumbs up/down only (rejected — insufficient for a defamation mitigation); no contest (rejected — unacceptable per §13).
- **AC:** every finding has a reachable contest control; contesting sets a visible "contested" state and records it; acknowledgement path exists (S6).

### F10 — Educator Annotation & Curation — `MVP`
- **Purpose:** hide/show findings, add notes/questions, highlight items for teaching.
- **Business value:** unlocks the primary educator persona and Educator Task Success (S8).
- **User value:** O (Journey 2 core), secondarily P (notes for partner).
- **Dependencies:** F8.
- **Risks:** curation used to distort (mitigated: original findings remain in the underlying analysis; shared views note curation).
- **Alternatives:** defer to Phase-2 (rejected — O is a *primary* persona; her journey needs this at MVP).
- **AC:** educator can annotate and selectively present findings; shared/exported views indicate that curation was applied.

### F11 — History (save, search, resume) — `MVP`
- **Purpose:** persist analyses per user; search; resume incomplete/partial analyses.
- **Business value:** retention; supports data-retention controls.
- **User value:** M/O/P/D (all journeys reference save/resume).
- **Dependencies:** accounts; F8; F14 (privacy).
- **Risks:** storing third-party voices/PII (Research §13).
- **Alternatives:** stateless/no history (rejected — breaks resume + educator/journalist workflows).
- **AC:** analyses are listed, searchable, and resumable; deletion honored (F14); partial analyses resumable (Journey 2 E-ANALYSIS).

### F12 — Export & Share (read-only) — `MVP`
- **Purpose:** produce an annotated report / auditable trail; share a read-only link.
- **Business value:** distribution + the educator/journalist deliverable (S8).
- **User value:** O (class artifact), D (auditable trail for editor), P (partner notes).
- **Dependencies:** F8, F10; `/legal`.
- **Risks:** exported findings about named people circulating out of context (Research §13) → mitigations: disclaimers on export, no person-level verdicts by construction (locked #3).
- **Alternatives:** no export (rejected — kills O/D value); public-by-default sharing (rejected — privacy/abuse risk).
- **AC:** export preserves anchors, confidence, and contestation state; shared views are read-only and carry disclaimer + limitations link; person-level verdicts are absent by construction.

### F13 — Categorical Confidence Display + "How to read this" — `MVP`
- **Purpose:** show calibrated **categorical** confidence on every finding; explain its meaning in `/help` and tooltips (Research §10).
- **Business value:** the uncertainty-first thesis made visible (Vision §3); underpins S4.
- **User value:** M/O (non-numeric, plain-language), P/D (honest signal).
- **Dependencies:** F8; calibration approach (Phase 02).
- **Risks:** miscalibration (Research §7, §15 #3) → S4 monitors.
- **Alternatives:** numeric % default (rejected — Research §10; `SUCCESS_METRICS.md` rejection list); hide confidence (rejected — violates thesis).
- **AC:** default confidence display is categorical; meaning is documented; numeric detail is opt-in at most; no single aggregate "score of the debate" is shown.

### F14 — Account, Privacy & Data-Retention Controls — `MVP`
- **Purpose:** accounts; user-facing retention/deletion controls; consent messaging for uploaded third-party content (Research §13).
- **Business value:** legal compliance posture (GDPR/CCPA principles — **[UNVERIFIED]** specifics, verify w/ counsel).
- **User value:** O/D (institutional/professional), all users (privacy).
- **Dependencies:** F11.
- **Risks:** biometric/voice-data handling; third-party non-consenting voices (Research §13).
- **Alternatives:** no retention controls (rejected — §13).
- **AC:** users can view/delete their analyses and data; retention setting exists; consent/acceptable-use surfaced at ingest; deletion propagates.

### F15 — Prompt-Injection Containment (content-as-data) — `MVP` (cross-cutting)
- **Purpose:** treat all ingested content as untrusted data, not instructions; contain injection attempts (Research §12, OWASP LLM01).
- **Business value:** security/integrity; protects every other feature.
- **User value:** M/O/P/D — invisible but protects all (Journeys E-INJECTION).
- **Dependencies:** all analysis features (F3–F7).
- **Risks:** OWASP notes no fool-proof prevention (Research §12) → S10 measures containment continuously.
- **Alternatives:** none — mandatory given our input model.
- **AC:** injected instructions in submitted content do not alter analysis behavior in the red-team suite (S10); suspicious content may be flagged; segregation of untrusted content is enforced.

### F16 — Timeline / "How the argument evolved" — `MVP`
- **Purpose:** show how claims/positions develop over the course of the debate (Research §8 gap: temporal view none of the competitors offer).
- **Business value:** differentiator.
- **User value:** M (follow the arc), O (teach development), P (track clash over time).
- **Dependencies:** F2 (time codes), F3.
- **Risks:** low — presentational; inherits upstream confidence.
- **Alternatives:** defer to Phase-2 (considered; kept in MVP because it's low-cost on existing time-coded data and a cheap, unique differentiator).
- **AC:** timeline maps findings to their time position; clicking a point navigates the transcript; inherits anchor + confidence.

---

## PHASE-2 FEATURES (post-MVP, on roadmap)

| ID | Feature | Why deferred (not MVP) | Primary future persona |
|---|---|---|---|
| F20 | **Live / near-real-time analysis** | Materially harder latency/cost (Research §14); locked #1 defers it | M, general public |
| F21 | **Walton argumentation schemes + critical questions** | Richer but heavier than Toulmin; Toulmin covers MVP need (Research §3.3) | P, O |
| F22 | **Debater-mode rubric packs (LD/Policy/BP)** | Serves secondary persona P; additive on F5 (Research §1.2, §17) | P |
| F23 | **Journalist/fact-checker workbench (bulk claims, editorial export)** | Leans on weakest tech; secondary persona D; add after core proven (Research §17) | D |
| F24 | **Team/classroom workspaces & roles** | Multi-user org features beyond MVP educator flow | O |
| F25 | **Comparative analysis across multiple debates** | Depends on stable single-analysis core + export | D, researcher |
| F26 | **API for researchers** | Serves deferred researcher persona; needs stable core (Research §9) | researcher |
| F27 | **Multilingual analysis** | Adds ASR/mining complexity across languages | all |

## REJECTED FEATURES (with rationale)

| ID | Feature | Rejected because |
|---|---|---|
| R1 | **"Who won the debate" verdict / overall score** | Scope exclusion #1; no universal rubric (Research §0.1, §1.2); implies false precision (Research §10). |
| R2 | **Person-level verdict ("X lied / is a liar")** | Locked #3; top defamation/harassment vector (Research §13, §12). |
| R3 | **Argument/rebuttal generation ("help me win")** | Out of scope (analysis-only, Research §0.1); abuse/persuasion-optimization vector (Research §2.2, §12; Vision §4 #7). |
| R4 | **Single numeric confidence score as default** | Incentivizes over-confidence — the core failure mode (Research §10, §15 #3); rejected metric. |
| R5 | **Autonomous "fact-checker of record" authoritative true/false stamps** | Recall ceiling ~83.5% (Research §2.3); liability (Research §13); conflicts with uncertainty-first thesis. |
| R6 | **Covert/social deployment (bots posting analyses)** | Directly the condemned UZH-experiment harm (Research §2.2); abuse (Research §12). |
| R7 | **Neutral single "credibility oracle" rating** | No neutral oracle exists (Research §6.1); locked #4 mandates provenance + contestation. |

---

## Traceability summary (Quality-Gate evidence)
Every MVP feature (F1–F17) names ≥1 persona need (M/O/P/D) and cites the Research finding(s) driving it. Every rejected feature maps to a specific research-backed risk or scope exclusion. No MVP feature exceeds the locked scope. ✅

---

## AMENDMENT A1 — Add F17 (Fallacy, Rhetoric & Misleading-Statement Detection)
- **Date:** 2026-07-04 · **Raised during:** Phase 02 (AI Architecture) dependency check.
- **What changed:** Added MVP feature **F17** (below). Traceability summary updated F1–F16 → F1–F17.
- **Why (gap):** The locked product scope (`PRODUCT_VISION.md` §0.1 / `00-RESEARCH.md` §0.1) explicitly requires identifying **logical fallacies, rhetorical techniques, and misleading/incomplete statements.** `INFORMATION_ARCHITECTURE.md` §1 defines a "Fallacy & Rhetoric" view, `05-DESIGN-SPEC.md` page 8 renders it, and `REQUIREMENTS.md` NFR-2/NFR-18 govern "fallacy findings" — **but no feature produced them.** This was a dangling reference (a Definition-of-Complete violation) in Phase 01, undetected until Phase 02's pipeline required a fallacy-detection stage.
- **Decision-Hierarchy trigger:** Research (rank 1) + Product Vision (rank 2) both mandate fallacy/rhetoric analysis; Feature Specifications (rank 5) omitted it. Higher ranks win → the feature must exist. Resolved by amendment to the lower-priority document (this file), not by altering scope.
- **Downstream effect / what it invalidates:** `01-PHASE-COMPLETION.md` §6 "no dangling references ✅" and §2 consistency check were **incorrect** and are superseded by this amendment (they should have caught it). `REQUIREMENTS.md` needs a functional requirement for fallacy detection — see companion AMENDMENT R-A1 there. No prior *decision* is reversed; a missing artifact is added. Phase 02 may now trace its fallacy stage to F17.

### F17 — Fallacy, Rhetoric & Misleading-Statement Detection — `MVP`
- **Purpose:** flag **possible** logical fallacies, rhetorical techniques, and misleading/incomplete statements, each anchored to a transcript span, framed as *possible/pattern-consistent* and contestable — never as an authoritative or person-level verdict.
- **Business value:** a core, differentiating analysis pillar named in the product scope; the "Fallacy & Rhetoric" view (IA §1) depends on it.
- **User value:** M (learn to spot flawed reasoning — top learner need), O (teach fallacy/rhetoric evaluation), P (catch flawed reasoning in practice rounds), D (flag misleading statements with care).
- **Dependencies:** F3 (claims), F2/transcript anchors; feeds F8 (workspace/report) and the Fallacies tab.
- **Risks:** fallacy detection is the least-reliable capability — low F1 at useful granularity and highly subjective (Research §5.2); false positives are a trust *and* defamation vector (Research §5.3, §13).
- **Alternatives considered:** fold into F4 (rejected — conflates "unsupported" with "fallacious"); Walton schemes as the engine (deferred to F21). Omitting it entirely is a scope violation (not an option).
- **AC:** every flag is span-anchored, carries categorical confidence, and is framed "possible …" and contestable (F9); **precision-over-recall** (NFR-2); no person-level verdict (FR-10/20); "no likely fallacies identified" is a valid, honest result; low-confidence transcript spans inherit an added reliability caveat.

*End of FEATURE_SPECIFICATION.md*
