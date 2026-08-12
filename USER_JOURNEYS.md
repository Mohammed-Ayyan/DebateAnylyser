# USER_JOURNEYS.md

**Project:** Debate Analyser v2 · **Phase:** 1 · **Date:** 2026-07-04
**Upstream (binding):** `00-RESEARCH.md`, `PRODUCT_VISION.md`, `USER_PERSONAS.md`. Locked input #1: uploads/URLs first (no live journeys at launch).

## 0. Conventions
Each journey covers the **happy path** and explicit **failure/error paths** (required by GLOBAL PROMPT). Failure paths are first-class because the product's trust model depends on graceful, honest failure (Research §10, §14, §12). Stages reference features (F#) defined in `FEATURE_SPECIFICATION.md` and IA locations in `INFORMATION_ARCHITECTURE.md`.

Shared error taxonomy (referenced by all journeys):
- **E-INGEST** — upload/URL fails (unsupported format, too large, URL blocked/ToS, private video).
- **E-ASR** — transcription fails or low-confidence (poor audio, overlapping speakers → diarization uncertainty; Research §15 #4).
- **E-ANALYSIS** — analysis stage fails/times out (long-context cost/latency; Research §14).
- **E-EVIDENCE** — evidence retrieval returns nothing or only contested sources (Research §6.1).
- **E-INJECTION** — submitted content contains prompt-injection attempt (Research §12).
- **E-LOWCONF** — analysis completes but confidence is low / evidence insufficient → must surface "insufficient evidence," not fabricate (Research §15).

---

## Journey 1 — Marcus (Learner): "Is this podcast argument any good?"

**Happy path:**
1. **Discover/land** → home; chooses "Analyze something."
2. **Ingest (F1)** → pastes a YouTube link of an interview. System validates URL + ToS (F1a).
3. **Transcribe (F2)** → progress shown; streamed status (WCAG 4.1.3 status messages, Research §11).
4. **Analysis streams in (F3–F7)** → claims, evidence, structure, fallacy flags, credibility appear incrementally (streaming-first, Research §14; S12).
5. **Explore (F8 report)** → Marcus sees a claim flagged "evidence: weak / needs verification." He expands it (this is the NSM value moment, `SUCCESS_METRICS.md` §1) → sees the transcript span + retrieved sources + a plain-language "why."
6. **Learn** → categorical confidence badge ("Low confidence") + a one-line explanation; jargon toggle off by default (Research §10, Persona Marcus).
7. **Optional** → saves analysis to History (F11); toggles "Explain like I'm new" mode.

**Failure/error paths:**
- **E-INGEST (private/ToS-blocked video):** clear message "This video can't be accessed (private or not permitted for analysis)"; offer upload-a-file or paste-transcript alternative. Never silently proceed.
- **E-ASR (bad audio):** show a transcription-confidence banner; mark low-confidence spans; warn that analysis of those spans is less reliable (Research §15 #4). Let him proceed with eyes open or upload a cleaner source.
- **E-LOWCONF:** conclusion shows "Insufficient evidence to assess" rather than a guess (Research §15). Marcus learns the honest state.
- **E-INJECTION:** the injected instruction in the transcript is neutralized (treated as data, not command, Research §12); a subtle notice may indicate suspicious content was found; analysis integrity preserved.

---

## Journey 2 — Ms. Ortega (Educator): "Prep a debate for class"

**Happy path:**
1. **Sign in** (educator context; privacy-aware, Research §13).
2. **Ingest (F1)** → uploads an MP4 of a recorded classroom-appropriate debate.
3. **Transcribe + speaker labels (F2)** → diarization with a confidence indicator.
4. **Analysis (F3–F7)** → integrated report.
5. **Curate for teaching (F10 annotate)** → hides some findings, adds her own notes/questions, highlights two fallacy flags as discussion prompts.
6. **Export/share (F12)** → generates an annotated report / rubric artifact (Educator Task Success metric S8).
7. **In class** → students open a shared, read-only view and argue about the *evidence*.

**Failure/error paths:**
- **E-INGEST (file too large / unsupported):** explicit limit + supported-format list; suggest compression/transcript.
- **Named-person safety:** if the debate includes an identifiable public figure, the report shows evidence + confidence + contestation, **never** "X lied" (locked #3; Research §13). Ortega sees this guardrail explicitly, which is *why she trusts it* (Persona Ortega).
- **E-EVIDENCE (only contested sources):** credibility signals show provenance + "sources disagree / contested" state (Research §6.1); Ortega can use this as a teachable moment rather than hitting a dead end.
- **E-ANALYSIS timeout:** partial results are preserved and resumable; she is told which stages completed (no silent total failure; Research §14).

---

## Journey 3 — Priya (Debater): "Review my practice round"

**Happy path:**
1. **Ingest (F1)** → uploads audio of a practice round.
2. **Transcribe (F2).**
3. **Structure view (F5 Toulmin map)** → claims/data/warrants/rebuttals mapped; implicit warrants flagged.
4. **Weakness detection (F4/F6)** → weak-evidence and possible-fallacy flags, each anchored to the exact span (precision-first; Research §5.3).
5. **Drill down** → she disagrees with one fallacy flag → **contests it (F9)**; the flag is marked "contested," logged (S5/S6).
6. **Export (F12)** notes for her partner.

**Failure/error paths:**
- **False-positive fallacy flag:** because Priya is expert (Persona Priya, very-high trust sensitivity), a wrong flag is likely to be caught. The contest control (F9) turns a trust-losing moment into a logged correction (Research §12/§13 contestability). If contest volume on a flag type is high, S5 surfaces it for model review.
- **E-ASR (fast debate "spreading," overlapping speech):** diarization/low-confidence banner; affected structure nodes marked uncertain rather than asserted (Research §15 #4, #6).
- **E-LOWCONF on structure:** the map shows "unclear structure here" instead of inventing warrants/rebuttals (Research §3.1 arg-mining generalizes poorly).

---

## Journey 4 — Dana (Journalist): "Pull check-worthy claims from an interview"

**Happy path:**
1. **Ingest (F1)** → uploads interview audio of a public figure.
2. **Transcribe + speaker labels (F2).**
3. **Claim extraction (F3)** → check-worthy claims listed, each with transcript anchor.
4. **Evidence + credibility (F6/F7)** → retrieved sources with **provenance and contestation** shown (locked #4; Research §6.2); attribution verified, not assumed.
5. **Auditable export (F12)** → traceable trail (claim → span → source → confidence) for her editor.

**Failure/error paths:**
- **Defamation guardrail (central):** for every negative finding about the named public figure, output is evidence + confidence + contestation, with a **higher evidence bar** for negative labels (locked #3; Research §13). No "the senator lied" output is possible by design.
- **E-EVIDENCE (no reliable source):** claim marked "unverified — no reliable source found," never guessed (Research §2.3 recall ceiling, §15 #5).
- **Citation integrity:** any emitted citation is resolution-checked (S2 fabrication guard); an unresolvable source is dropped and flagged, not shown as real (Research §15 #1).
- **E-INJECTION (adversarial upload):** hostile instructions in the audio transcript are contained (Research §12).

---

## 1. Cross-journey guarantees (invariants)
Regardless of persona or path, the system MUST:
1. Never show a conclusion without an anchor + confidence, or else show "insufficient evidence" (Research §15).
2. Never assert a person-level verdict (locked #3; Research §13).
3. Fail *honestly and partially* — preserve completed work, name what failed, offer a next step (Research §14, §10).
4. Treat all ingested content as untrusted (Research §12).
5. Show credibility signals with provenance + contestation (Research §6.1).

These invariants become functional requirements in `REQUIREMENTS.md` and acceptance criteria in `FEATURE_SPECIFICATION.md`.

*End of USER_JOURNEYS.md*
