# USER_PERSONAS.md

**Project:** Debate Analyser v2 · **Phase:** 1 · **Date:** 2026-07-04
**Upstream (binding):** `00-RESEARCH.md` §9 (draft personas), `PRODUCT_VISION.md` §2. Locked input #2: primary = learners + educators.

## 0. Status & method
Research §9 provided **7 draft personas, explicitly flagged as unvalidated hypotheses.** This document **finalizes 4** for the MVP: 2 primary (the design center) and 2 secondary (served, not centered). The other 3 draft personas (researcher, content creator, general user) are folded in as noted or deferred to later phases (`ROADMAP.md`). **These remain hypotheses pending user research** — see Open Ambiguity O-P1 in `01-PHASE-COMPLETION.md`. Each persona includes the field GLOBAL PROMPT required: **trust sensitivity to AI judgment of their arguments.**

Traceability note: trust-sensitivity framing derives from Research §10 (trust calibration), §5.3 (false-positive trust damage), and §13 (person-level judgment risk).

---

## PRIMARY 1 — Marcus, the Critical-Thinking Learner
*(Consolidates Research §9 personas "Marcus" (student) and "Alex" (general critical-thinking user).)*

- **Snapshot:** 19, undergraduate / self-directed learner. Watches political debates, interviews, and long-form podcasts and wants to *not get fooled*.
- **Goals:** learn to spot weak evidence, unsupported claims, and fallacies himself; understand *why* an argument is strong or weak, not just be told a score.
- **Frustrations:** existing tools either give him an opaque verdict he can't learn from, or require expertise he doesn't have; he can't tell when an AI is confidently wrong.
- **Technical fluency:** medium. Comfortable with apps; not with probability, statistics, or ML jargon. Numeric confidence ("87%") means little to him (Research §10 — numeric confidence "assumes users grasp probability").
- **Trust sensitivity to AI judgment of arguments:** **Medium.** He's analyzing *others'* content, so he's not personally attacked — but he is highly vulnerable to **over-trusting** a confident-looking AI (Research §10 over-reliance). If the tool is confidently wrong once and he catches it, he'll dismiss the whole product; if he *doesn't* catch it, he learns the wrong lesson. Needs plain-language explanations, honest uncertainty, and non-jargon confidence (categorical, not numeric).
- **What success looks like for him:** "I understood which claims to double-check and why — and the tool was honest about what it wasn't sure of."

---

## PRIMARY 2 — Ms. Ortega, the Educator
*(Research §9 "Ms. Ortega".)*

- **Snapshot:** 41, high-school / early-college teacher of civics, English, or critical thinking. Wants a classroom-safe tool to teach argument evaluation.
- **Goals:** show students transparent reasoning; generate discussion material and exportable rubrics/annotated reports; model *how* to evaluate, not *what* to conclude.
- **Frustrations:** worried about tools that brand a student's (or a public figure's) argument "wrong" without evidence; needs privacy, moderation, and accessibility for a diverse classroom; needs to trust it in front of students.
- **Technical fluency:** medium; high pedagogy fluency. Values clarity and defensibility over raw power.
- **Trust sensitivity to AI judgment of arguments:** **High (institutional).** She is professionally accountable — an over-confident or defamatory output in a classroom is a serious problem for her. She needs the tool to *visibly* show uncertainty and contestability so it models good epistemics, and she needs assurance it will never assert a person "lied" (locked input #3; Research §13). She will abandon it instantly if it feels like an "AI judge."
- **What success looks like for her:** "I put a debate in front of my class, and the tool helped them argue about the *evidence* — and I never had to worry it would say something reckless."

---

## SECONDARY 1 — Priya, the Debater / Coach
*(Research §9 "Priya".)*

- **Snapshot:** 24, competitive debater and part-time coach (LD/Policy/BP; Research §1.2).
- **Goals:** structure maps (Toulmin), missed-clash and weak-evidence detection on practice rounds; fast, exportable, rigorous notes.
- **Frustrations:** generic tools miss debate-specific structure; wrong fallacy calls are worse than none.
- **Technical fluency:** high domain fluency; medium tech.
- **Trust sensitivity to AI judgment of arguments:** **Very high (expert scrutiny).** She will catch and punish wrong fallacy/structure calls immediately (Research §5.2 fallacy F1 is low; §3.1 arg-mining generalizes poorly). For her, precision-over-recall and "show the span you're basing this on" are non-negotiable. She is the persona most likely to *stress-test* the uncertainty framing — which makes her valuable feedback, but she is **secondary** because designing primarily for her expert rigor would over-narrow the MVP (Research §17, Direction A is narrower market).
- **What success looks like for her:** "It caught a warrant I left implicit and showed me exactly where — and when it wasn't sure, it said so instead of bluffing."

---

## SECONDARY 2 — Dana, the Journalist / Fact-Checker
*(Research §9 "Dana"; consolidates researcher needs for exportable, auditable data.)*

- **Snapshot:** 34, journalist / fact-checker analyzing interviews and speeches.
- **Goals:** extract check-worthy claims; retrieve evidence with provenance; assess source credibility defensibly; export an auditable trail.
- **Frustrations:** existing fact-check tools miss argument context and have recall ceilings (Research §2.3 ~83.5%); needs defamation safety and traceability.
- **Technical fluency:** medium-high; high information-literacy.
- **Trust sensitivity to AI judgment of arguments:** **High (professional/legal).** She works with named public figures, so the defamation surface is maximal (Research §13). She *needs* the "no person-level verdict + provenance + contestation" model not as a limitation but as legal cover. She is **secondary** because centering the MVP on her would lean on the weakest, highest-risk capabilities (fact-check recall, citation faithfulness) that Research §17 explicitly warns against making primary.
- **What success looks like for her:** "It gave me a traceable list of check-worthy claims with sources and honest confidence — and it never put words in a subject's mouth."

---

## 1. Cross-persona synthesis (design implications)

| Need | Marcus | Ortega | Priya | Dana | Design consequence |
|---|---|---|---|---|---|
| Plain-language explanations | ●●● | ●●● | ● | ●● | Explanation-first UI; jargon toggle (Research §10) |
| Categorical (not numeric) confidence | ●●● | ●●● | ●● | ●● | Categorical confidence default (Research §10) |
| Traceable evidence anchors | ●● | ●●● | ●●● | ●●● | Every finding links to transcript span + source (Research §15) |
| Never adjudicate a person | ●● | ●●● | ●● | ●●● | Hard product rule (locked #3; Research §13) |
| Contestability | ●● | ●●● | ●●● | ●●● | Contest control on every finding (Research §12, §13) |
| Accessibility / classroom-safe | ●● | ●●● | ● | ● | WCAG 2.2 AA baseline (Research §11) |
| Export / share artifacts | ● | ●●● | ●● | ●●● | Export & annotated-report features |

(●●● critical, ●● important, ● useful.)

**The unifying thread:** all four personas — across very different trust sensitivities — are best served by the *same* uncertainty-first, traceable, non-adjudicative core. This validates the single MVP analysis engine (Research §17: secondary personas are additive on the same core).

*End of USER_PERSONAS.md*
