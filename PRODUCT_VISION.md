# PRODUCT_VISION.md

**Project:** Debate Analyser v2
**Phase:** 1 — Product Planning
**Date:** 2026-07-04
**Upstream (binding):** `00-RESEARCH.md` (Decision Hierarchy rank 1). This document is rank 2 and may not silently override Research.
**Locked Phase-1 inputs (confirmed by product owner, 2026-07-04):**
1. Launch ingest = **uploads/URLs first**; live conversation deferred (resolves Research §16 #1).
2. Primary persona = **critical-thinking learners + educators**; debaters/journalists/researchers secondary (resolves §16 #2).
3. Named-person policy = **no person-level verdicts**; evidence + calibrated confidence + contestation, higher evidence bar for negative labels on identifiable people (resolves §16 #3).
4. Evidence sourcing = **retrieval with shown provenance + contestation**, attribution verified not assumed (resolves §16 #5).

These confirmations match Research's recommendations, so **no amendment to Phase 00 is required.**

---

## 1. Problem Statement

People consume more argumentative content than ever — debates, interviews, podcasts, speeches, panel discussions — but have almost no tooling to evaluate the *quality of reasoning* inside it. Existing tools each solve one slice and leave the rest (Research §8): Kialo structures debates but does not analyze them; fact-checkers (ClaimBuster, Full Fact, Originality.ai) verify isolated facts but ignore argument structure, warrants, and fallacies; fallacy browser-extensions flag fallacies in news text only, at accuracy the research shows is unreliable (Research §5). None ingest audio/video/YouTube, and none integrate **claims + evidence + structure + fallacies + source credibility** into one traceable, uncertainty-aware view.

The consequence for the target user — a student, learner, or educator trying to think critically about what they just watched — is that they must either take an argument at face value or do painstaking manual analysis. Meanwhile, the naive "AI verdict" products that could fill this gap are precisely the ones the research warns are dangerous: LLM fact-check recall tops out near 83.5% (§2.3), fallacy detection F1 collapses at useful granularity and is intrinsically subjective (§5.2), and AI-attached citations are fully supported only ~51.5% of the time and are frequently fabricated (§6.2, §15). An over-confident "who won / who lied" tool would be both untrustworthy and legally hazardous (§13).

**The problem we solve:** *There is no trustworthy tool that helps a non-expert see and evaluate the reasoning inside spoken or written argumentative content — one that shows its work, communicates uncertainty honestly, and never pretends to be the final judge.*

## 2. Target User

**Primary:** critical-thinking **learners** (students and self-directed learners) and **educators** who teach argument evaluation, media literacy, or critical thinking. They want to *learn to see* claims, evidence gaps, fallacies, and rhetoric — not to be handed a verdict. This audience is the design center because the research shows the technology is reliable at *explanation* and unreliable at *authoritative judgment* (Research §17 rationale), and because an educational, uncertainty-first framing is the strongest available mitigation for the top risks (§5.3, §12, §13).

**Secondary (served, not the design center):** competitive **debaters/coaches**, **journalists/fact-checkers**, and **researchers**. Their needs are additive on the same analysis core and are addressed in later phases (see `ROADMAP.md`), not by diluting the MVP.

Full persona definitions are in `USER_PERSONAS.md`.

## 3. Product Thesis

> **Debate Analyser v2 is a media-literacy analysis platform that helps people understand and evaluate the arguments inside debates, interviews, and speeches — by surfacing claims, evidence, structure, fallacies, and source credibility, with every conclusion traceable to its source and labeled with honest, calibrated confidence, and without ever declaring a winner or a verdict on a person.**

Three commitments make the thesis real, each grounded in Research:
1. **Traceable-or-silent.** No conclusion is shown without (a) an anchor to the exact transcript span and/or external source it rests on, (b) an explicit calibrated confidence, and (c) an "insufficient evidence → say so" fallback (Research §15 cross-cutting principle).
2. **Uncertainty-first, not verdict-first.** The UI communicates what is well-supported, what needs verification, and what is uncertain — never a single authoritative score that implies false precision (Research §10, §7).
3. **Analysis, never adjudication of people.** The product evaluates *arguments and statements*, attaching evidence + confidence + contestation; it never asserts a person "lied" or "is fallacious" (locked input #3; Research §13, §12).

## 4. Explicit Scope Exclusions

The product **does not**, in v2:
1. **Declare a debate winner or an overall "who was right."** (Locked scope, Research §0.1, §1.2 — no universal rubric exists.)
2. **Generate arguments, rebuttals, or debate speeches.** Analysis only (Research §0.1). Generation is out of scope entirely, not merely deferred.
3. **Assert person-level verdicts** ("X lied," "Y is a liar/fallacious"). (Locked input #3.)
4. **Analyze live conversation in real time at launch.** Uploads/URLs/transcripts first; live is a later, separately-scoped capability (locked input #1, Research §14, §16 #1).
5. **Present any source-credibility rating as neutral ground truth.** All credibility signals ship with provenance and known contestation (locked input #4, Research §6.1).
6. **Provide legal, medical, or professional advice**, or act as an authoritative fact-checking-of-record service. It is an educational analysis aid.
7. **Offer covert or "persuasion-optimization" features** (e.g., "help me win this argument against a named person"). Explicitly excluded as an abuse vector (Research §2.2, §12).

Scope-exclusion items 1–4 directly exclude or bound the highest-risk items flagged in Research; items 3, 5, 7 are risk *mitigations* rather than pure exclusions (see Quality Gate in `01-PHASE-COMPLETION.md`).

## 5. Differentiation

| Dimension | Existing tools (Research §8) | Debate Analyser v2 |
|---|---|---|
| **Integration** | Point tools: structure *or* facts *or* fallacies | Integrated claims + evidence + structure + fallacies + credibility in one traceable report |
| **Input** | Text-only (Kialo, fallacy extensions, most fact-checkers) | Multimodal: audio, video, YouTube/URL, transcript, text |
| **Stance on certainty** | Implicit verdicts / scores | Uncertainty-first: explicit calibrated confidence, "needs verification" states, no false precision |
| **Traceability** | Citations emitted but unverified (§6.2, ~51.5% supported) | Every conclusion anchored to transcript span + external source; **attribution verified, not assumed** |
| **Framing** | Verdict/accusation-oriented | Educational, non-adversarial; teaches evaluation; never adjudicates a person |
| **Temporal view** | None | Shows how a debate/argument evolves over time |

**Defensible moat:** the combination of *multimodal ingest + integrated analysis + uncertainty-first, traceable, non-adjudicative framing* is unoccupied (Research §8 headline: "no existing product is a comprehensive argument-analysis platform"). Competitors that *could* copy the feature set are structurally disinclined to adopt the uncertainty-first framing because it undercuts the "AI gives you the answer" pitch — which is exactly the framing the research shows is unsafe here.

## 6. Vision → downstream traceability

Every MVP feature in `FEATURE_SPECIFICATION.md` must trace to a persona need in `USER_PERSONAS.md`, which traces to this thesis and problem statement, which trace to `00-RESEARCH.md`. Every non-functional requirement in `REQUIREMENTS.md` cites the specific Research finding that drove it. This chain is enforced by the Phase-1 Quality Gate.

---
*End of PRODUCT_VISION.md*
