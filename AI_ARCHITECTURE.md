# AI_ARCHITECTURE.md

**Project:** Debate Analyser v2 · **Phase:** 2 (AI Architecture) · **Date:** 2026-07-04
**Decision-Hierarchy rank:** 3. Binding upstream: `00-RESEARCH.md` (1), `PRODUCT_VISION.md` + Phase-01 docs (2/5). This document may not override higher ranks; any conflict is logged + amended (see `02-PHASE-COMPLETION.md`).
**Sibling Phase-02 docs:** `PROMPT_STRATEGY.md`, `RAG_STRATEGY.md`, `MODEL_SELECTION.md`, `EVALUATION.md`, `HALLUCINATION_PREVENTION.md`.

## 0. Conventions
Per the GLOBAL PROMPT, **every design choice states: alternatives rejected · cost/latency/accuracy trade-off · which Phase-00 hallucination risk (Research §15 H1–H6) it mitigates.** Phase-00 risk IDs used throughout:
- **H1** fabricated citations/sources · **H2** fabricated/mislabeled fallacies · **H3** overstated confidence · **H4** misattributed quotes/claims · **H5** fabricated facts in verdicts · **H6** invented argument structure. Plus **security** (Research §12 prompt injection) and **legal** (Research §13 defamation).

Cross-cutting principle inherited from Research §15 and locked into every stage: **no conclusion without (a) a traceable anchor, (b) explicit calibrated confidence, (c) an "insufficient evidence → say so" fallback.**

Every stage below has an **explicit output schema** (full field-level contracts live in `PROMPT_STRATEGY.md`; this doc names the object and its guarantees). Object vocabulary matches `INFORMATION_ARCHITECTURE.md` §4 (Analysis / Transcript / Finding / Source / Contest).

---

## 1. Pipeline overview

```
(S0 Ingest/rights) → S1 Transcribe+Diarize → S2 Claim Extraction → S3 Support Assessment
   → S4 Argument Structure (Toulmin) → S5 Fallacy/Rhetoric → S6 Evidence Retrieval (RAG)
   → S7 Source Credibility → S8 Scoring/Synthesis → S9 Citation Assembly → S10 Output/Stream
                                   │
        cross-cutting: XA Injection Defense · XB Confidence Calibration · XC Self-Check/Verify · XD Named-Person Guardrail
```

Design stance (traces to Research §14 performance + §17 direction): the pipeline is a **code-orchestrated workflow of narrow, schema-validated stages**, *not* an open-ended autonomous agent. Rationale below (§3). Stages stream to the UI as they complete (F8/NFR-14); a failed stage is isolated and the rest are preserved (NFR-15).

---

## 2. Stages (technique · rationale · alternatives · trade-off · risk mitigated)

### S0 — Ingestion & Rights Gate  *(F1/F1a; not an LLM stage)*
- **Technique:** deterministic format/size validation; URL rights/ToS check; acceptable-use gate; extract media/caption tracks. No model involved.
- **Rationale:** legal exposure (Research §13) must be handled before any content is processed; keeps untrusted bytes out of the model path until classified.
- **Alternatives rejected:** LLM-based "is this allowed?" (rejected — non-deterministic legal gate is unsafe; §13).
- **Trade-off:** negligible latency/cost; high legal-risk reduction.
- **Mitigates:** legal §13; feeds security §12 (marks all downstream content untrusted).

### S1 — Transcription + Diarization  *(F2)*
- **Technique:** ASR with word-level timestamps + speaker diarization; emit per-segment **ASR confidence** and **diarization confidence**; low-confidence spans flagged.
- **Output schema:** `Transcript{ segments:[{start,end,speaker,text,asr_conf,diar_conf,low_conf:bool}], speakers:[...] }`.
- **Rationale:** the transcript is the anchor spine (IA §2); every later Finding references a segment. Surfacing ASR/diarization uncertainty is the H4 mitigation at the source.
- **Alternatives rejected:** transcript-only product (kills multimodal moat, Research §8); hiding confidence (violates uncertainty-first thesis).
- **Trade-off:** ASR adds a pre-analysis latency stage (Research §14); batch (upload) tolerates it. Accuracy on messy audio is bounded → caveats propagate.
- **Mitigates:** **H4** (misattributed quotes) — low-confidence/overlap spans are marked so downstream findings inherit caveats and diarization is never asserted with false certainty.

### S2 — Claim Extraction  *(F3)*
- **Technique:** LLM extraction constrained by a **strict structured-output schema**; each claim carries `span_ref` (S1 segment id + char offsets), `claim_type` (factual/value/policy/causal), `speaker`, `extraction_confidence`. Retrieval/generation grounded strictly in transcript text.
- **Output schema:** `Finding[claim]{ id, span_refs[], text (verbatim-or-marked-paraphrase), claim_type, confidence, contest_state }`.
- **Rationale:** argument mining generalizes poorly across domains (Research §3.1) → we constrain to extraction-from-source with mandatory spans and an "unclear" fallback rather than free generation.
- **Alternatives rejected:** open generation of "the claims being made" (rejected — invents claims, H6); a fine-tuned classifier only (deferred — LLM+schema is faster to ship and adequate; revisit in eval).
- **Trade-off:** one LLM pass over long context = main cost driver (Research §14); mitigated by streaming + caching (`MODEL_SELECTION.md`).
- **Mitigates:** **H6** (invented structure) partial, **H4** (spans enforce provenance).

### S3 — Support Assessment  *(F4)*
- **Technique:** for each claim, LLM judges **speaker-provided support** (present / weak / absent) using only in-transcript evidence; explicitly *not* external truth. Distinct field from S6 factual verification.
- **Output schema:** `Finding[support]{ claim_id, support_level, rationale, span_refs[], confidence, insufficient:bool }`.
- **Rationale:** conflating "unsupported in this text" with "false" is a top over-claim risk (Research §15).
- **Alternatives rejected:** merging support + fact-check (rejected — dangerous conflation).
- **Trade-off:** extra pass; can share context/cache with S2.
- **Mitigates:** **H5** (guards against asserting falsity from mere absence of support).

### S4 — Argument Structure (Toulmin)  *(F5)*
- **Technique:** map claim → data/grounds → warrant → backing → qualifier → rebuttal; **inferred nodes explicitly flagged `inferred:true` with lower confidence**; emit "unclear structure" node instead of fabricating.
- **Output schema:** `StructureNode{ id, role∈Toulmin, span_refs[]|null, inferred:bool, confidence }`, `StructureEdge{from,to,relation}`.
- **Rationale:** Toulmin is the grounded scaffold (Research §3.2); §3.1 weak generalization forces the inferred-flag + unclear fallback.
- **Alternatives rejected:** Walton schemes (deferred F21 — heavier); freeform prose summary (loses pedagogy).
- **Trade-off:** graph construction pass; List-view render is free (design).
- **Mitigates:** **H6** (invented structure) — inference is labeled, never asserted.

### S5 — Fallacy / Rhetoric / Misleading-Statement Detection  *(F17 — added by AMENDMENT A1)*
- **Technique:** LLM classification against a **fixed, documented taxonomy** (MAFALDA-style levels, Research §5.1) producing **"possible <type>"** flags only; each anchored to a span; **precision-tuned** (high threshold, abstain by default). Confidence prominent. Named-person items pass through XD guardrail.
- **Output schema:** `Finding[fallacy]{ id, span_refs[], possible_type, taxonomy_ref, why, confidence, contest_state, person_involved:bool }`.
- **Rationale:** fallacy detection is the least-reliable capability — low F1 at fine granularity, high subjectivity (Research §5.2); false positives are a trust + defamation vector (§5.3, §13). Hence precision-over-recall (NFR-2/FR-21) and "possible/contestable" framing (NFR-18).
- **Alternatives rejected:** recall-tuned flagging (rejected — false positives destroy trust and create defamation risk); definition-only prompting shown not to reliably help (Research §2.3) → we pair taxonomy + few-shot + abstention (`PROMPT_STRATEGY.md`).
- **Trade-off:** deliberately trades recall for precision (misses some real fallacies — logged to the user via honest "possible only / no likely fallacies" states, never silently).
- **Mitigates:** **H2** (fabricated/mislabeled fallacies) — abstention + threshold + contestability; legal §13.

### S6 — Evidence Retrieval (RAG)  *(F6 — full design in `RAG_STRATEGY.md`)*
- **Technique:** for check-worthy claims (from S2), retrieve external sources; **attribution is verified, not assumed** — each candidate citation is resolution-checked and NLI-checked that the source actually supports the statement before it can attach (see `RAG_STRATEGY.md`).
- **Output schema:** `Source{ id, url, retrieved_snippet, provenance, resolves:bool, supports_relation∈{supports,refutes,neutral,insufficient} }` linked to `Finding` via `evidence_refs[]`.
- **Rationale:** AI-attached citations are fully supported only ~51.5% and are frequently fabricated (Research §6.2, §15 H1) → verification gate is mandatory.
- **Alternatives rejected:** trust model-emitted citations (rejected — H1); curated-corpus-only (locked #4 chose retrieval + provenance; corpus is a *supplement*, `RAG_STRATEGY.md`).
- **Trade-off:** retrieval + verification adds latency/cost and network dependency (Research §14); "no reliable source → unverified" is a normal outcome (Research §2.3).
- **Mitigates:** **H1** (fabricated citations), **H5** (no fact assertion without traceable source).

### S7 — Source Credibility Signals  *(F7)*
- **Technique:** attach **categorical** credibility signal (Higher/Mixed/Lower) to each verified Source **with provenance + a "method is contested" note**; never a neutral score. Multiple raters shown with disagreement.
- **Output schema:** `Source.credibility{ level, method_provenance, contested:bool, rater_refs[] }`.
- **Rationale:** no credibility oracle is neutral/uncontested (Research §6.1); locked #4.
- **Alternatives rejected:** single numeric credibility (rejected — false neutrality, §6.1; also R4/R7).
- **Trade-off:** more UI/relational complexity; higher trustworthiness + legal safety.
- **Mitigates:** legal §13; H3 (avoids false-precision authority).

### S8 — Scoring / Synthesis  *(F8 overview; NOT a verdict)*
- **Technique:** aggregate findings into the **Overview**: a *categorical* read + a **claim-distribution** (counts by support level) + explore-first pointers. **No aggregate score, no winner, no person verdict.** Any LLM-generated summary is grounded strictly in prior stage outputs (no new facts).
- **Output schema:** `AnalysisOverview{ categorical_read, distribution{strong,moderate,weak,unsupported}, top_insight, explore_pointers[] }`.
- **Rationale:** FR-10/NFR-5 forbid aggregate verdicts/false precision; §17 education-first.
- **Alternatives rejected:** an overall "quality score" (rejected — R1/R4, the inspiration's 74% conflict); LLM free-summary (constrained to grounded synthesis to avoid H5).
- **Trade-off:** synthesis pass over structured findings (cheap; short input).
- **Mitigates:** **H3, H5** (no invented aggregate claims), legal §13.

### S9 — Citation Assembly  *(F6/F12; traceability guarantee)*
- **Technique:** bind every displayed Finding to its `span_refs` (transcript) **and/or** verified `evidence_refs` (Source). A Finding with neither is **not emitted** — it is downgraded to an **Insufficient-Evidence** card. Unresolved/failed citations are dropped + flagged, never shown.
- **Output schema:** enforced invariant on every `Finding`: `has_anchor == (span_refs≠∅ ∨ verified evidence_refs≠∅) ∨ state==insufficient`.
- **Rationale:** this is the mechanical enforcement of "traceable-or-silent" (Research §15; NFR-3/4). It is a **hard gate**, not a prompt suggestion.
- **Alternatives rejected:** trusting the model to self-cite (rejected — H1).
- **Trade-off:** may suppress genuine-but-untraceable findings → accepted (precision/honesty over coverage).
- **Mitigates:** **H1, H5** (guarantees full traceability; see `02-PHASE-COMPLETION.md` Quality Gate).

### S10 — Output / Streaming  *(F8/F13/F16)*
- **Technique:** stream findings per completed stage with categorical **confidence badges** (XB); render Insufficient/Contested states first-class; expose contest control (F9) on every Finding.
- **Output schema:** the assembled `Analysis` object (IA §4) with per-stage status.
- **Mitigates:** **H3** (calibrated categorical confidence, XB), UX §10.

---

## 3. Cross-cutting components

### XA — Injection Defense (Research §12, OWASP LLM01)
- **Technique:** treat all ingested content as **data, structurally segregated** from instructions (delimited, role-separated, never concatenated into the system prompt); deterministic output-schema validation on every stage; least-privilege tool tokens; no tool can be invoked *by* analyzed content; a lightweight injection-signal check may flag suspicious spans. Continuous red-team suite (S10 metric).
- **Rationale/trade-off:** OWASP states no fool-proof prevention exists (§12) → defense-in-depth, measured (S10), not assumed. Small overhead; large security value.
- **Mitigates:** security §12. Full detail in `HALLUCINATION_PREVENTION.md` §guardrails.

### XB — Confidence Calibration (Research §7, §15 H3; NFR-1)
- **Technique:** map model signals to **categorical bands** (High/Med/Low/Insufficient) whose thresholds are **calibrated against a human-labeled audit set** (reliability-diagram style); never display raw model self-confidence as truth; numeric only via Settings opt-in (F13).
- **Alternatives rejected:** raw LLM logprob/self-reported % as the band (rejected — LLM confidence is miscalibrated, §7); no confidence (violates thesis).
- **Trade-off:** requires an ongoing labeled audit set (EVALUATION.md); worth it — calibration is the product's premise.
- **Mitigates:** **H3**.

### XC — Self-Check / Verification Pass (Research §15; NFR-19)
- **Technique:** a second, independent pass **adversarially verifies** high-impact findings (fallacy flags, any negative finding about a named person, factual verdicts): re-checks span support, citation support (NLI), and taxonomy fit; disagreement → downgrade confidence or convert to Insufficient. LLM-as-judge scores are **calibrated, never trusted raw** (§7 biases).
- **Alternatives rejected:** single-pass trust (rejected — H2/H5); majority self-consistency only (kept as an option for fallacy flags, but independent-perspective verify preferred for diversity, Research §7).
- **Trade-off:** extra passes on a *subset* (high-impact only) to bound cost/latency (§14).
- **Mitigates:** **H2, H5, H1** (verification), legal §13.

### XD — Named-Person Guardrail (Research §13; FR-20; locked #3)
- **Technique:** detect identifiable individuals; for any negative finding about them, enforce a **higher evidence threshold**, require XC verification, strip any person-level verdict phrasing, and attach evidence + confidence + contestation. Hard rule, checked at S9 gate.
- **Mitigates:** legal §13 (defamation), security §12 (harassment-via-labeling).

---

## 4. Reliability envelope (numeric targets — deferred inputs now owned here)
Per `REQUIREMENTS.md` §3 / `SUCCESS_METRICS.md` §3, numeric targets were deferred to Phase 02/07. This phase **sets the target *framework*; the calibrated numeric thresholds are produced by the Phase-07 baseline audit** (they cannot be fixed without measured data — fixing them now would be unjustified, GLOBAL RULES). Targets and their owners:
| Target | Metric | Set by |
|---|---|---|
| Citation fabrication ≈ 0 (hard launch gate) | S2/S9 audit | S9 resolution gate + Phase-07 audit |
| Citation support rate (well above 51.5% baseline) | S1/S6 audit | S6 NLI-verify + Phase-07 |
| Confidence calibration error within band | S4 audit | XB + Phase-07 |
| Injection containment ≥ threshold (hard gate) | S10 red-team | XA + Phase-07 |
| Named-person policy adherence = 100% (hard gate) | S11 audit | XD + S9 gate + Phase-07 |
| P95 time-to-first-insight | S12 timing | streaming design + Phase-07 |
These map 1:1 to `SUCCESS_METRICS.md` S1–S12 and `EVALUATION.md`.

## 5. Hallucination-risk → mitigation coverage (Quality-Gate evidence)
| Phase-00 risk | Named mitigation (stage/component) |
|---|---|
| H1 fabricated citations | S6 verify-attribution + S9 resolution gate + XC |
| H2 fabricated/mislabeled fallacies | S5 precision-tuned + abstain + XC + F9 contest |
| H3 overstated confidence | XB calibration + S8 no-aggregate-score + F13 |
| H4 misattributed quotes | S1 ASR/diarization confidence + span anchoring + caveat inheritance |
| H5 fabricated facts in verdicts | S3/S6 separation + S9 traceable-or-silent + Insufficient states + XC |
| H6 invented argument structure | S2 span-constrained + S4 inferred-flag + "unclear" fallback |
| security §12 injection | XA (content-as-data, schema-validate, least-privilege, red-team) |
| legal §13 defamation | XD guardrail + S5/S7 framing + S9 gate + contestability |
**Every Phase-00 hallucination risk has a named mitigation. ✅**

*End of AI_ARCHITECTURE.md*
