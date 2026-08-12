# REQUIREMENTS.md

**Project:** Debate Analyser v2 · **Phase:** 1 · **Date:** 2026-07-04
**Upstream (binding):** `00-RESEARCH.md`, `PRODUCT_VISION.md`, `FEATURE_SPECIFICATION.md`, `USER_JOURNEYS.md`, `INFORMATION_ARCHITECTURE.md`.
**Quality-Gate rule:** every **non-functional** requirement cites the specific `00-RESEARCH.md` finding that drove it. Functional requirements trace to a feature (F#) and/or journey invariant.

## 1. Functional Requirements (FR)

| ID | Requirement | Trace |
|---|---|---|
| FR-1 | The system shall accept audio, video, and text file uploads; YouTube/web URLs; and pasted transcripts/text. | F1; locked #1 |
| FR-2 | The system shall run a rights/ToS + acceptable-use check before URL fetch and before first analysis, refusing restricted content with a specific reason and an alternative. | F1a; Research §13 |
| FR-3 | The system shall transcribe A/V into time-coded, speaker-labeled transcripts and expose transcription/diarization confidence, marking low-confidence spans. | F2; Research §15 #4 |
| FR-4 | The system shall extract claims, each anchored to its exact transcript span. | F3; Journey invariant #1 |
| FR-5 | The system shall assess speaker-provided support per claim (present/weak/absent), kept distinct from external factual truth. | F4; Research §15 |
| FR-6 | The system shall map argument structure (Toulmin), marking inferred/implicit nodes as inferred with lower confidence, and showing "unclear structure" rather than fabricating nodes. | F5; Research §3.1, §3.2 |
| FR-7 | The system shall retrieve external evidence for check-worthy claims and present each source with provenance; every citation shall be resolution-checked, with unresolvable sources dropped and flagged. | F6; Research §6.2, §15 #1 |
| FR-8 | The system shall present source-credibility signals only with their method/provenance and a contestation note; never as neutral ground truth. | F7; Research §6.1; locked #4 |
| FR-9 | The system shall attach to every finding: transcript anchor(s), a categorical confidence, and evidence/source references — or else display an explicit "insufficient evidence" state. | F8/F13; Research §15 |
| FR-10 | The system shall never output a debate winner, an overall verdict score, or a person-level verdict about an identifiable individual. | Vision §4 #1/#3; locked #3; Research §13 |
| FR-11 | The system shall provide a contest/feedback control on every finding, set a visible "contested" state, and record it for review. | F9; Research §12, §13 |
| FR-12 | The system shall let educators annotate and selectively present findings, indicating in shared/exported views that curation was applied. | F10; Persona O |
| FR-13 | The system shall persist analyses per user with search and resume of partial/incomplete analyses. | F11; Journeys |
| FR-14 | The system shall export an annotated/auditable report and provide read-only share links carrying a disclaimer + limitations link. | F12; Research §13 |
| FR-15 | The system shall provide user-facing data view/deletion and retention controls, and surface consent/acceptable-use at ingest. | F14; Research §13 |
| FR-16 | The system shall render analysis results incrementally (streaming) with accessible status messages. | F8; Research §14, §11 |
| FR-17 | The system shall present a timeline of how claims/positions evolve, navigable to the transcript. | F16; Research §8 |
| FR-18 | The system shall treat all ingested content strictly as data, segregated from system instructions, and shall not act on instructions embedded in submitted content. | F15; Research §12 |
| FR-19 | The system shall default confidence display to categorical form and document its meaning in `/help`; numeric detail is at most opt-in. | F13; Research §10 |
| FR-20 | For negative findings concerning an identifiable person, the system shall apply a higher evidence threshold and present evidence + confidence + contestation. | Locked #3; Research §13 |
| FR-21 | The system shall detect and flag **possible** logical fallacies, rhetorical techniques, and misleading/incomplete statements, each anchored to a transcript span, framed as possible/pattern-consistent and contestable, never as a person-level verdict. | F17 (added by AMENDMENT A1 in `FEATURE_SPECIFICATION.md`); Research §5; scope §0.1 |

> **AMENDMENT R-A1 (2026-07-04, raised in Phase 02):** FR-21 added to back the newly-added feature F17 (fallacy/rhetoric/misleading-statement detection). Trigger: Research (rank 1) + Product Vision (rank 2) mandate fallacy/rhetoric analysis, which had no functional requirement. NFR-2 and NFR-18 already governed how fallacy findings must behave (precision-first; framed as possible/contestable) but no FR mandated *producing* them — this closes that gap. See `FEATURE_SPECIFICATION.md` AMENDMENT A1.

## 2. Non-Functional Requirements (NFR) — each cites a Research finding

### 2A. Trust, transparency & correctness
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-1 | Confidence displays shall be **calibrated** (stated confidence must track audited actual correctness) and monitored via a calibration metric. | §7 (LLM-judge biases; miscalibration), §15 #3 (overstated confidence) |
| NFR-2 | The system shall favor **precision over recall** for any finding that labels reasoning (fallacies) or concerns a person. | §5.3 (fallacy F1 low, false-positive → trust/defamation harm) |
| NFR-3 | Every displayed conclusion shall be **traceable** to a transcript span and/or verified external source; untraceable conclusions shall not be shown. | §6.2 (citation support ~51.5%), §15 (traceable-or-silent) |
| NFR-4 | Citation **fabrication rate** shall be driven to near-zero via automated source resolution before display. | §15 #1 (fabricated citations ~47% in studies), §6.2 |
| NFR-5 | The UI shall communicate uncertainty explicitly and shall not present a single aggregate score implying false precision. | §10 (over-confident scoring UI; PAIR), §7 |

### 2B. Security
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-6 | Submitted content shall be handled per OWASP LLM01 mitigations (role constraint, content segregation, output validation, least privilege); injection containment shall be adversarially tested continuously. | §12 (OWASP LLM01 prompt injection; our input is untrusted) |
| NFR-7 | The system shall not offer persuasion-optimization or covert-deployment capabilities. | §2.2 (condemned covert-persuasion experiment), §12 (abuse) |

### 2C. Legal & privacy
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-8 | The system shall operate under published Terms, Acceptable-Use, and disclaimers, linked at ingest, share, and export. | §13 (defamation/misinformation liability; ToS a requirement) |
| NFR-9 | Personal/biometric (voice) data shall follow data-minimization, storage-limitation, consent, and deletion principles; third-party voices in uploads shall be treated as data subjects. | §13 (GDPR/CCPA principles; voice biometric) — specifics **[UNVERIFIED]**, verify w/ counsel |
| NFR-10 | The liability posture shall assume generated analysis may be first-party (not §230-protected). | §13 (§230 uncertainty for AI-generated content) |
| NFR-11 | URL ingest shall respect platform ToS (e.g., YouTube) and prefer official APIs/captions over scraping. | §13 (YouTube ToS / copyright) — **[UNVERIFIED]**, verify before build |

### 2D. Accessibility
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-12 | The product shall meet **WCAG 2.2 AA** as a baseline: contrast (1.4.3), never color-alone for meaning (1.4.1), keyboard operability (2.1.1) + visible focus (2.4.7), status messages for streaming (4.1.3), name/role/value for custom widgets (4.1.2). | §11 (WCAG 2.2) |
| NFR-13 | A plain-language/low-density reading mode shall be available for dense, emotionally charged content. | §11 (emotionally charged content; reading level), §10 |

### 2E. Performance
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-14 | Analysis shall be **streamed** (first insight before full completion) to manage long-context LLM latency; a P95 time-to-first-insight target shall be set in Phase 02/07. | §14 (KV-cache/long-context latency; streaming mitigation) |
| NFR-15 | The pipeline shall preserve and resume partial results on stage failure/timeout (no silent total failure). | §14 (cost/latency), Journeys E-ANALYSIS |
| NFR-16 | Long-context and multi-stage cost shall be bounded via architecture chosen in Phase 02; per-analysis cost/rate-limiting is an explicit constraint. | §14 (compute-heavy multi-stage; rate-limit reality) |

### 2F. Reliability of AI outputs (envelope)
| ID | Requirement | Research finding cited |
|---|---|---|
| NFR-17 | The system shall present an "insufficient / no reliable evidence" state wherever support is lacking, rather than asserting a verdict. | §2.3 (fact-check recall ~83.5%), §15 #5 |
| NFR-18 | Fallacy and structure findings shall be framed as *possible/pattern-consistent* and contestable, not authoritative. | §5.2 (low F1, high subjectivity), §5.3 |
| NFR-19 | Any use of an LLM to score argument quality shall be calibrated against human labels, not trusted raw. | §7 (position/verbosity/self-preference bias) |

## 3. Requirement → downstream note
Numeric targets (P95 latency NFR-14, calibration thresholds NFR-1, injection-containment threshold NFR-6, fabrication threshold NFR-4) are **intentionally deferred** to Phase 02 (AI Architecture) / Phase 07, because setting them without the AI reliability envelope would be unjustified (mirrors `SUCCESS_METRICS.md` §3). Logged as a dependency in `01-PHASE-COMPLETION.md`, not an omission.

## 4. Traceability check
Every FR traces to a feature/journey invariant; every NFR cites a specific Research finding (with **[UNVERIFIED]** items flagged for verification). No requirement introduces scope beyond the locked inputs. ✅

*End of REQUIREMENTS.md*
