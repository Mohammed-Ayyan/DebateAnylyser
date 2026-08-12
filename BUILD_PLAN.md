# BUILD_PLAN.md — Debate Analyser v2

**Status:** NON-DRAFT · FROZEN · BINDING (Phase 06.00 output)
**Decision-Hierarchy rank:** Build (rank 8) — subordinate to all rank 1–7 documents.
**Supersedes:** any prior filename-inferred build ordering. This plan is constructed **exclusively from documented dependencies, contracts, shared APIs, shared DB entities, shared components, and AI stage input/output contracts.** Every dependency carries a document + section citation. An uncited dependency has been logged as an Open Ambiguity (§9), **not** treated as a dependency.

> **Provenance rule applied (PROMPT 06, 06.00):** The `Fx` identifiers are **spec identifiers only**. No ordering below is inferred from numbering, filenames, or naming. Each edge is traced to a stated dependency / contract in a cited document.

---

## 0. How to read this plan

- **§1** Dependency table (Order · Feature · Depends-On (cited) · Citation · What Breaks If Reordered)
- **§2** F14 placement decision (definitive, cited)
- **§3** F15 placement decision (definitive, cited)
- **§4** The five mandated re-examinations, resolved with citations
- **§5** Per-feature complexity (Low/Med/High), justified to spec content
- **§6** Per-feature implementation risks, specific to each spec
- **§7** Per-feature acceptance criteria, extracted from each spec (no invention)
- **§7b** Per-feature rollback notes (migrations / feature-flags / shared-infra flag)
- **§8** Shared-Infrastructure (06.02) census with the **80% rule** applied per component
- **§8b** Dangling-document confirmation (every mandated doc referenced ≥1×, cited)
- **§9** Open Ambiguities (only items genuinely unresolvable from current docs)
- **§10** Milestone sequence (06.01 → 06.N+1)

---

## 1. Dependency Table (citation-verified build order)

Order is a topological sort of the **cited** edges only. Slices with no edge between them are marked as an unordered group `{…}` and may be built in any internal order.

| # | Feature | Depends On (cited edges only) | Citation (doc + section) | What Breaks If Reordered |
|---|---------|-------------------------------|--------------------------|--------------------------|
| — | **06.02 Account/Identity Core** (F14 subset) | — (foundational) | SECURITY_MODEL §1 (accounts required), §2 (ownership); SYSTEM_ARCHITECTURE §1 (AuthN/Z is a core API-service responsibility) | Every owner-scoped endpoint has no principal to scope to; 403/ownership cannot be enforced. |
| — | **06.02 Injection Containment / XA** (F15) | every AI stage S2–S7 | HALLUCINATION_PREVENTION §7 (“content-as-data on every stage… schema validation every stage”); SECURITY_MODEL §3; AI_ARCHITECTURE XA; F15 §1/§4 (“no dedicated user-facing endpoint of its own”) | Any AI stage built before containment ships an unguarded prompt surface (OWASP LLM01); E-INJECT hard gate cannot pass. |
| 1 | **F1a** Rights/ToS/Acceptable-Use Gate | Account core (consent principal) | F1a FR-2, §14; SECURITY_MODEL §4/§7; 00-RESEARCH §13 (legal), §12 (abuse) | If F1 runs first, content is fetched/processed **before** the rights/legal gate — the exact pre-build legal exposure counsel must clear (00-RESEARCH §13.4 YouTube ToS; §13.1 defamation). |
| 2 | **F1** Multi-format Ingest / Submission Envelope | **F1a** (rights gate); writes `analyses` row | F1 §1 (“F1 does not itself… gate rights (F1a)”), §11 edge 4 (“URL ingest runs F1a before fetching”); FEATURE_SPECIFICATION F1 Dependencies “F1a”; AI_ARCHITECTURE S0 | Ingest without a preceding gate = unauthorised fetch/process; no `analyses` row means nothing downstream has an owner or a status. |
| 3 | **F2** Transcription + Diarization (S1) | **F1** (submission envelope / object) | F2 §1 (Dependency: F1); AI_ARCHITECTURE S1; FEATURE_SPECIFICATION F2 | No transcript/spans → S2–S7 have no `SpanRef` anchor; S9 traceable-or-silent gate can never be satisfied. |
| 4 | **F3** Claim Extraction (S2) | **F2** (transcript + spans), F1 | F3 §1 (“F4/F5/F6/F17/F7 build on it”), §6 (In: transcript S1); PROMPT_STRATEGY S2; AI_ARCHITECTURE S2 | F3 is the foundation primitive for all analysis findings; nothing downstream has claims to operate on. |
| 5 | **{F4, F6}** (unordered pair) — F4 Support (S3), F6 Evidence Retrieval (S6) | each depends **F3** only | F4 §1 (Dependency: F3); F6 §1 (Dependency: F3); PROMPT_STRATEGY S3/S6; AI_ARCHITECTURE | No cited edge F4↔F6. Building either before F3 leaves it without claims; ordering them relative to each other breaks nothing (no cited edge). |
| 6 | **F5** Argument Structure / Toulmin (S4) | **F3** (claims) **+ F4** (support) | F5 §1 (“Depends on F3 (claims) and F4 (support)”), §6 (In: claims S2 + support S3); PROMPT_STRATEGY S4 (“In: claims + support”); AI_ARCHITECTURE S4 | If F5 runs before F4, the structure stage has no support input → Toulmin warrant/backing roles cannot be populated as specified. **F5 does NOT depend on F17** (see §4). |
| 7 | **F7** Source Credibility Signals (S7) | **F6** (sources) | F7 §1 (Dependency: F6); PROMPT_STRATEGY S7; AI_ARCHITECTURE S7 | No retrieved sources → nothing to rate; `finding_credibility` has no `source` to attach to. |
| 8 | **F17** Fallacy / Rhetoric Detection (S5) | **F3** (claims) **+ structure (F5)** + F2 anchors | F17 §6 (“In = claims + structure + spans”); PROMPT_STRATEGY S5 (“In: claims + structure + spans”); AI_ARCHITECTURE S5 | If F17 runs before F5, it has no `finding_structure` to consume; fallacy-in-structure detection degraded. **F17 consumes structure; the reverse edge does not exist** (see §4). |
| 9 | **F13** Confidence Display primitive (XB) | calibration set (Phase 02) — co-dependent with F8 | F13 §1 (Dependency: F8 + calibration); AI_ARCHITECTURE XB; FEATURE_SPECIFICATION F13. **Mutual edge F8↔F13 logged in §9.** | F8 lists F13 as a dependency (needs the categorical badge primitive to render confidence); if the categorical banding primitive is absent, F8 would have to render raw confidence — violating FR-19. Built as the confidence primitive consumed by F8. |
| 10 | **F8** Analysis Workspace / Report (S8/S9/S10 surface) | **F2–F7** + **F13** | F8 §1 (Dependencies F2–F7, F13); AI_ARCHITECTURE S8/S9/S10; API_SPECIFICATION (GET /analyses/{id}, /findings, /findings/{fid}/evidence) | The workspace is the assembly/read surface for all upstream findings; building it earlier means it renders empty finding kinds. S9 gate (shared infra) must be live before findings surface. |
| 11 | **{F16, F9, F10}** (unordered group) | F16 → **F2, F3**; F9 → **F8**; F10 → **F8** | F16 §1 (Deps F2, F3); F9 §1 (“F9 depends on F8”); F10 §1 (“F10 depends on F8… does not redefine F9’s contest mechanics”) | No cited edge among F16/F9/F10. **F10 does NOT depend on F9** (see §4). Building F9/F10 before F8 leaves no findings to contest/annotate; F16 before F2/F3 has no time-coded claims. |
| 12 | **F14-feature** Privacy / Retention / Deletion / Consent / Data-export | Account core (06.02); F11 (mutual — see §9) | F14 §1; DATABASE_SCHEMA §7 (deletion cascade); SECURITY_MODEL §5; FEATURE_SPECIFICATION F14 Dependencies “F11” | Deletion cascade and retention schedule must exist before F11’s `DELETE /analyses/{id}` and resume can honour retention. Shared `DELETE /analyses/{id}` ownership flagged in §9. |
| 13 | **F11** History / List / Search / Resume | accounts, **F8**, **F14** (privacy/deletion) | F11 §1 (“F11 depends on accounts, F8, and F14”); API_SPECIFICATION (GET /analyses, DELETE/PATCH /analyses/{id}, POST …/resume); STATE_ARCHITECTURE (resume) | Listing/resume before F8 exists lists nothing; before F14 deletion/retention, DELETE/PATCH cannot honour privacy rules. |
| 14 | **F12** Export / Share | **F8** + **F10** | F12 §1 (Dependencies F8, F10); API_SPECIFICATION (POST …/shares, …/exports, GET /shared/{token}); SECURITY_MODEL §2 (share tokens read-only/revocable) | Export/share of a report requires the report (F8) and applied curation (F10.`shares.curation_applied`); earlier build has nothing to export. |

**Citation-verified linear order (with unordered groups expanded):**
`06.02 shared` → **F1a → F1 → F2 → F3 → {F4, F6} → F5 → F7 → F17 → F13(⊗F8) → F8 → {F16, F9, F10} → F14-feature → F11 → F12**
(`⊗` = mutual/co-built pair, see §9.)

---

## 2. F14 Placement Decision — **DEFINITIVE: SPLIT** (not TBD)

**Decision:** F14 is split into two build units:

**(A) Account / Identity Core → 06.02 Shared Infrastructure.**
Scope: `users` table; session auth (`POST /auth/session`, `DELETE /auth/session`); `GET /me`; the single ownership/AuthZ layer (owner-scoping, 403 on non-owner); `user_preferences` row (shared with F13).
**Why 06.02 (cited):**
- SECURITY_MODEL §1 — “accounts required”; authentication is foundational, not per-feature.
- SECURITY_MODEL §2 — every `analyses/{id}` and child is owner-scoped through a **single** authz layer.
- SYSTEM_ARCHITECTURE §1 — AuthN/Z is a **core API-service responsibility**; the API cannot delegate identity to a feature.
- Census (§8): required by **~100%** of features (every owner-scoped surface). Passes the 80% rule on the census **and** rests on a documented cross-feature requirement.

**(B) Privacy / Retention / Deletion / Consent / Data-export → Feature Slice (Order #12).**
Scope: `data_events`, `retention_schedule`; deletion cascade (DATABASE_SCHEMA §7); `POST /me/consent`; `POST /me/data-export`; `DELETE /me`; `PATCH /me/settings` (privacy); retention/deletion UI.
**Why a feature slice (cited):**
- These are user-facing capabilities with their own endpoints and their own tables, **not** required by ~100% of features — the 80% rule forbids putting them in Shared Infrastructure.
- F14 §14 preserves four **[UNVERIFIED]** legal ambiguities (GDPR/CCPA NFR-9, §230 NFR-10, YouTube-ToS NFR-11, third-party non-consenting-voice enforcement AMENDMENT-05-04) — these are resolved within the slice, gated on counsel sign-off (00-RESEARCH §13; SECURITY_MODEL §7 “counsel sign-off is a hard pre-build gate”), not baked into shared infra.

> The **mutual F11↔F14** reference is broken by placing identity in 06.02; the residual soft ordering (F14-feature before F11) and shared `DELETE /analyses/{id}` ownership are logged in §9.

---

## 3. F15 Placement Decision — **DEFINITIVE: 06.02 Shared Infrastructure** (not a feature slice)

**Decision:** F15 (Prompt-Injection Containment / cross-cutting XA) is built in **06.02 Shared Infrastructure**, as a property of the shared AI-stage execution harness. It is **not** a feature slice and is **not** scoped to a single input surface.

**Why 06.02 (cited):**
- F15 §1/§4 — F15 has **“no dedicated user-facing endpoint of its own”**; it owns only the `injection_flags` table. A unit with no endpoint and one cross-cutting table is infrastructure, not a feature slice.
- HALLUCINATION_PREVENTION §7 — content-as-data segregation and deterministic output-schema validation apply **“on every stage.”** This is pipeline-wide by mandate.
- SECURITY_MODEL §3 — injection defense is defined as a pipeline-wide control.
- AI_ARCHITECTURE — XA is a **cross-cutting** component spanning S2–S7, not a stage.
- FEATURE_SPECIFICATION F15 Dependencies — “all analysis features (F3–F7).”

**Relation to the 80% rule (honest accounting, §8):** F15’s beneficiaries (F2, F3, F4, F5, F6, F7, F17 — the AI stages) are ~47% of the 17 features, so it does **not** qualify on the numeric census. It qualifies on the **explicitly-permitted alternative basis** in PROMPT 06: *“Never create shared abstractions based on prediction — only on documented cross-feature requirements or repeated implementation.”* F15 is a **documented cross-feature requirement** at rank-3 (HALLUCINATION_PREVENTION §7) and rank-4 (SECURITY_MODEL §3, AI_ARCHITECTURE XA) — not a predicted convenience. Placement therefore stands on the documented-mandate basis, and §8 records this distinction explicitly rather than hiding it behind the census.
**Build-phase decision inside F15:** AMENDMENT-05-05 (delimiter-collision escaping for the `<<<SOURCE>>>…<<<END>>>` wrapper) is resolved within this unit as an implementation detail, since HALLUCINATION_PREVENTION §7 mandates the wrapper but not its escaping scheme.

---

## 4. The Five Mandated Re-examinations (resolved with citations, not assumption)

**(a) F14 — standalone slice or Shared Infrastructure?** → **SPLIT.** Account/identity core → 06.02; privacy/retention → feature slice. Citations: SECURITY_MODEL §1/§2, SYSTEM_ARCHITECTURE §1 (core→06.02); F14 §14 + DATABASE_SCHEMA §7 + 80% rule (privacy→slice). Full reasoning §2.

**(b) F15 — pipeline-wide infra or one input surface?** → **Pipeline-wide → 06.02.** Citations: F15 §1/§4 (“no dedicated endpoint”), HALLUCINATION_PREVENTION §7 (“every stage”), SECURITY_MODEL §3, AI_ARCHITECTURE XA. Full reasoning §3.

**(c) Does F17 feed F5, or does F5 depend only on F3(+F4)?** → **F5 depends on F3 + F4; F5 does NOT consume F17. F17 consumes structure (F5).**
- F5 §1: “Depends on F3 (claims) and F4 (support).” F5 §6 In-contract: claims (S2) + support (S3). PROMPT_STRATEGY S4: “In: claims + support.” AI_ARCHITECTURE S4 confirms.
- F17 §6: “In = claims + structure + spans.” PROMPT_STRATEGY S5: “In: claims + structure + spans.” Pipeline order S4 (structure) precedes S5 (fallacy).
- **Hypothesis “F17 → F5” is REJECTED by the evidence.** The real edge is F5 → F17.

**(d) Does F10 depend on F9, or only on F8?** → **F10 depends on F8 only.**
- F10 §1: “F10 depends on F8… does not redefine… F9’s contest mechanics.” FEATURE_SPECIFICATION F10 Dependencies: “F8.”
- **Hypothesis “F10 → F9” is REJECTED.** F9 and F10 are an unordered group, both hanging off F8.

**(e) Must F1A precede F1?** → **YES, confirmed.**
- F1 §1 (“F1 does not itself… gate rights (F1a)”), §11 edge 4 (“URL ingest runs F1a before fetching”).
- F1a FR-2 (gate runs before URL fetch and before first analysis); F1a §14 (YouTube ToS [UNVERIFIED], counsel sign-off).
- FEATURE_SPECIFICATION F1 Dependencies “F1a.” AI_ARCHITECTURE S0 (legal gate before processing).
- SECURITY_MODEL §4/§7; **00-RESEARCH §13** (defamation, §230, GDPR/biometric voice, YouTube ToS — all legal-risk findings) and §12 (abuse); ROADMAP RK-6 (“counsel verification before build”).
- **Confirmed: F1a → F1.**

---

## 5. Per-feature Complexity (justified to spec content)

| Feature | Complexity | Justification (spec-grounded) |
|---------|-----------|-------------------------------|
| **06.02 Account core** | **Med** | Standard session auth + a single authz layer; low novelty but blast-radius is 100% of endpoints (SECURITY_MODEL §2). |
| **06.02 F15/XA** | **High** | Cross-cutting content-as-data wrapper + per-stage deterministic schema validation + `injection_flags` + E-INJECT hard gate + continuous red-team (HALLUCINATION_PREVENTION §7; F15 §1). Correctness is security-critical. |
| **F1a** | **Med** | Deterministic non-LLM branch logic (422 rights_blocked / 403 acceptable_use), but gated on [UNVERIFIED] legal inputs (F1a §14). |
| **F1** | **Med** | Multi-format validation + envelope + S0 orchestration; 5 edge cases (F1 §11). No AI. |
| **F2** | **High** | ASR + diarization adapter, `low_conf` caveat inheritance (H4), `is_named_person` XD flag, streaming; E-DIARIZE (F2 §1, edges). |
| **F3** | **High** | Foundation LLM primitive feeding five downstream stages; `check_worthy` typing; paraphrase-flag ambiguity (F3 §14). |
| **F4** | **Med** | Single-stage support classification; explicit “support ≠ truth” invariant (H5), no truth field (F4 §1). |
| **F5** | **High** | Toulmin role assignment + `structure_edges` graph + Map/List parity (C2); argument-mining is a known weak component (00-RESEARCH §3.1, §15.6). |
| **F6** | **High** | RAG retrieval + citation-verification gate (resolves ∧ NLI ∧ licensing-quote); E-CITE fabrication ≈0 hard gate (F6; RAG_STRATEGY §4). |
| **F7** | **Med-High** | Credibility signals with **no numeric score**; needs new `factor` enum column (F7 §14, AMENDMENT-05-02); no neutral oracle (00-RESEARCH §6). |
| **F17** | **High** | Fallacy detection at low F1/high subjectivity → precision-over-recall; E-FALLACY precision gate + E-PERSON P0 guardrail (F17; 00-RESEARCH §5). |
| **F13** | **Med** | Categorical banding primitive; calibration dependency (Phase 02); `confidence_raw` never displayed (F13; XB). |
| **F8** | **High** | 7-view workspace assembling S8/S9/S10; Distribution Bar (not a score); consumes all finding kinds; S9 gate surface (F8; AI_ARCHITECTURE S8–S10). |
| **F16** | **Low-Med** | Purely presentational; derived join, **no** new table/stage/Finding kind (F16 §1). |
| **F9** | **Med** | Contest control on every finding + `contests` table + moderation surface (F9 §1). |
| **F10** | **Med** | Annotation/curation composing existing components (no dedicated component — AMENDMENT-05-03); sets `shares.curation_applied` (F10 §14). |
| **F14-feature** | **High** | Deletion cascade (DATABASE_SCHEMA §7) + retention + consent + data-export, all under four [UNVERIFIED] legal ambiguities + counsel gate (F14 §14; SECURITY_MODEL §7). |
| **F11** | **Med** | List/search/resume; resume touches SSE `Last-Event-ID` + status lifecycle (STATE_ARCHITECTURE); depends F8 + F14. |
| **F12** | **Med-High** | Async export job (pdf/html) + public share token surface (read-only/revocable); inherits S9/XD “no verdict” (F12 §1; SECURITY_MODEL §2). |

---

## 6. Per-feature Implementation Risks (specific to each spec)

- **06.02 Account core** — a single authz layer is a single point of failure; a gap = cross-owner data exposure. Two MVP principals only (owner + anon share-viewer); do **not** introduce a role table (F24/team deferred).
- **06.02 F15/XA** — delimiter collision if analysed content contains the wrapper tokens (AMENDMENT-05-05, unresolved in spec → resolve in-build); per-stage schema validation must be deterministic and fail-closed, else E-INJECT gate is bypassable.
- **F1a** — legal inputs are [UNVERIFIED]; **must not ship** past counsel sign-off (hard pre-build gate). Risk of false-blocking legitimate content vs. false-allowing ToS-violating URL ingest.
- **F1** — format/size validation bypass; ensuring URL path calls F1a **before** any network fetch (F1 §11 edge 4).
- **F2** — diarization misattribution changes downstream speaker attribution (00-RESEARCH §15.4); `low_conf` must propagate caveats or downstream confidence is overstated.
- **F3** — over-extraction floods downstream stages; paraphrase vs. verbatim visual unresolved (F3 §14). Foundation errors amplify across F4/F5/F6/F7/F17.
- **F4** — collapsing “support present” into “claim true” (explicitly forbidden, H5); must preserve `absent`/`weak`/`present` without a truth field.
- **F5** — inventing warrants/rebuttals the speaker never made (00-RESEARCH §15.6); `inferred` flag must mark model-supplied structure; Map/List parity (accessibility).
- **F6** — fabricated citations (top domain risk, 00-RESEARCH §15.1); the resolve∧NLI∧licensing-quote gate must be enforced **before** a source attaches; E-CITE ≈0.
- **F7** — presenting credibility as an authoritative score (forbidden — no numeric `credibility_score`); needs the new `factor` enum (AMENDMENT-05-02) before build.
- **F17** — false/defamatory fallacy labels on named persons (00-RESEARCH §12–§13); precision-over-recall + XD guardrail + E-PERSON 100% adherence.
- **F13** — leaking raw model confidence (forbidden); categorical bands must be calibration-backed, not raw (XB); default categorical (FR-19).
- **F8** — accidental aggregate/winner via the Distribution Bar (forbidden FR-10); must render **only** post-S9-gated findings; empty-state per finding kind.
- **F16** — implying caus/verdict via timeline ordering; must stay a derived read (no new persistence).
- **F9** — contest spam / rate-limit class A; ensuring contest never mutates the finding.
- **F10** — annotation composed from C7/C5/B1 (no dedicated component, AMENDMENT-05-03); curation must not rewrite findings; `curation_applied` provenance.
- **F14-feature** — deletion cascade completeness (DATABASE_SCHEMA §7) or orphaned biometric/voice data; third-party non-consenting-voice enforcement mechanism unspecified (AMENDMENT-05-04); GDPR/CCPA/§230 [UNVERIFIED].
- **F11** — resume race with SSE `Last-Event-ID`; DELETE/PATCH must honour F14 retention; shared endpoint ownership (§9).
- **F12** — export/share leaking a person-level verdict (must inherit S9/XD); share token must be read-only, single-analysis, revocable (SECURITY_MODEL §2); async export status surface.

---

## 7. Per-feature Acceptance Criteria (extracted from each spec — no invention)

> Extracted from each `FEATURE_Fx` spec’s FR/AC lines and `FEATURE_SPECIFICATION.md`. Where a spec’s AC is not explicit, it is flagged in §9 rather than invented.

- **F1a** — `POST /me/consent` records consent; disallowed rights → **422 rights_blocked**; disallowed use → **403 acceptable_use**; URL path runs the gate **before** fetch; deterministic (non-LLM).
- **F1** — accepts video/audio/text/YouTube within format+size limits; creates an `analyses` row with owner + status `queued`; rejects invalid formats with a typed error; delegates transcription to F2 and rights to F1a; all 5 §11 edges handled.
- **F2** — produces `transcripts`/`speakers`/`transcript_segments` with time-coded spans; sets `low_conf` where ASR confidence is low; sets `speakers.is_named_person`; streams via `GET /analyses/{id}/transcript` + `/stream`; E-DIARIZE holds.
- **F3** — extracts claims into `finding_claim` with `claim_type` + `check_worthy`; each claim carries a `SpanRef`; over-/under-extraction bounded per spec; feeds F4/F5/F6/F17.
- **F4** — assigns `support_level ∈ {present, weak, absent}` with `rationale`; **no** truth field; every support finding references a claim.
- **F5** — assigns Toulmin `role` + `inferred` flag; builds `structure_edges`; Map and List views are at parity; input = claims + support.
- **F6** — attaches a source **only if** `resolves ∧ licensing_quote_verified ∧ supports_relation ≠ insufficient`; zero fabricated citations (E-CITE ≈0); `GET …/findings/{fid}/evidence` returns gated evidence.
- **F7** — emits `finding_credibility` referencing a source via the `factor` enum (AMENDMENT-05-02); **no** numeric credibility score; signals are contestable.
- **F8** — renders the 7 views from post-S9 gated findings; Distribution Bar shown as distribution (**not** a score/winner); `GET /analyses/{id}`, `/findings`, `/findings/{fid}/evidence` return owner-scoped data.
- **F17** — emits `finding_fallacy` (`possible_type`, `taxonomy_ref`, `why`, `person_involved`) with hedged framing + D8 guardrail banner; precision-gated (E-FALLACY); no person-level verdict (E-PERSON 100%).
- **F13** — default confidence display is **categorical**; `confidence_raw` never surfaced; `GET /me`, `PATCH /me/settings` toggle display; bands are calibration-backed.
- **F16** — `GET /analyses/{id}/timeline` returns a derived join (no timeline table); phase-band (E3); no new AI stage/Finding kind.
- **F9** — `POST /findings/{fid}/contests` records a contest without mutating the finding; `GET /analyses/{id}/contests` lists them; available on every finding.
- **F10** — `POST /analyses/{id}/annotations`, `PATCH/DELETE /annotations/{aid}`; sets `shares.curation_applied`; composes C7/C5/B1; does not alter F9 contest mechanics.
- **F14-feature** — `POST /me/consent`, `POST /me/data-export`, `DELETE /me`, `PATCH /me/settings`; deletion executes the DATABASE_SCHEMA §7 cascade; retention schedule enforced. **[Blocked on counsel sign-off — hard pre-build gate.]**
- **F11** — `GET /analyses` lists owner analyses with search; `DELETE/PATCH /analyses/{id}`; `POST /analyses/{id}/resume` resumes via status lifecycle; honours F14 retention.
- **F12** — `POST /analyses/{id}/shares` (read-only, revocable) + `DELETE …/{sid}`; `GET /shared/{token}` public read; `POST /analyses/{id}/exports` async (pdf/html) + `GET …/{eid}`; output inherits S9/XD (no verdict).

---

## 7b. Per-feature Rollback Notes

| Unit | Migrations | Feature flag | Shared-infra touch? |
|------|-----------|--------------|---------------------|
| 06.02 Account core | `users`, `user_preferences`, session store | `auth_enabled` (kill-switch would disable all access — treat as non-rollbackable once live) | **YES — Shared.** Rollback affects every feature; forward-fix only. |
| 06.02 F15/XA | `injection_flags` | `injection_containment` (fail-closed default; disabling opens LLM01) | **YES — Shared.** Do not disable in prod; forward-fix. |
| 06.02 wire contracts / base findings | base `findings`, `finding_spans`, `analysis_stage_runs` | — | **YES — Shared.** Schema change requires coordinated migration across all finding features. |
| F1a | none (uses account) | `rights_gate` | Reads shared account; gate itself is feature-flagged, **blocked on counsel**. |
| F1 | `analyses` | `ingest_multiformat` | Writes shared `analyses`; coordinate with status lifecycle. |
| F2 | `transcripts`,`speakers`,`transcript_segments` | `stage_s1_asr` | Adds tables; drop-safe if no downstream rows. |
| F3 | `finding_claim` | `stage_s2_claims` | Detail table only. |
| F4 | `finding_support` | `stage_s3_support` | Detail table only. |
| F6 | `sources`,`finding_evidence` | `stage_s6_rag` | Detail tables only. |
| F5 | `finding_structure`,`structure_edges` | `stage_s4_structure` | Detail tables only. |
| F7 | `source_credibility_ratings`,`finding_credibility` (+`factor` enum) | `stage_s7_credibility` | Adds enum column — coordinate migration order (AMENDMENT-05-02). |
| F17 | `finding_fallacy` | `stage_s5_fallacy` | Detail table only. |
| F13 | `user_preferences.confidence_display` | `confidence_display` | Touches shared `user_preferences` — additive column. |
| F8 | none (read surface) | `workspace` | Reads all shared finding tables; gated behind S9. |
| F16 | none (derived) | `timeline` | Read-only join. |
| F9 | `contests` | `contest` | Own table. |
| F10 | `annotations` (+`shares.curation_applied`) | `annotation` | Adds column to shared `shares` (introduced by F12) — coordinate. |
| F14-feature | `data_events`,`retention_schedule` | `privacy_retention` | Deletion cascade touches many tables (DATABASE_SCHEMA §7) — irreversible by design; test on non-prod. |
| F11 | none (uses `analyses`) | `history` | Reads shared `analyses`; DELETE honours F14. |
| F12 | `shares`,`exports` | `export_share` | Own tables; public `GET /shared/{token}` surface. |

---

## 8. Shared-Infrastructure (06.02) Census — 80% Rule Applied Per Component

**Rule (PROMPT 06):** For each proposed 06.02 component: list every feature that requires it + cite where; if **< 80%** of features require it, it **MUST NOT** be in Shared Infrastructure — defer to the earliest feature that introduces it; extract a shared abstraction only after the **second** implementation demonstrates the need. Shared abstractions may rest **only** on (i) a ≥80% documented census **or** (ii) a documented cross-feature requirement — **never** on prediction/convenience.

Denominator = 17 features (F1, F1a, F2–F17). 80% ⇒ ≥14 features.

| Proposed 06.02 component | Features that require it (cited) | Census | Basis | **Verdict** |
|---|---|---|---|---|
| **Account / identity + single AuthZ layer** | All owner-scoped features (F1,F1a,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11,F12,F13,F14,F16,F17) — SECURITY_MODEL §1/§2; SYSTEM_ARCHITECTURE §1 | ~17/17 (100%) | ≥80% census **and** documented mandate | **IN 06.02** |
| **F15 / XA injection containment + per-stage schema validation** | AI stages F2,F3,F4,F5,F6,F7,F17 — HALLUCINATION_PREVENTION §7; SECURITY_MODEL §3; AI_ARCHITECTURE XA; F15 §1/§4 | 7/17 (41%) | **Documented cross-feature requirement** (not census, not prediction) | **IN 06.02** (basis (ii); §3) |
| **S9 traceable-or-silent gate + XD named-person guardrail** | Every finding-producing/serving feature F3,F4,F5,F6,F7,F17,F8 — AI_ARCHITECTURE S9/XD; RAG_STRATEGY §4; SECURITY_MODEL §6 | 7/17 (41%) | **Documented cross-feature requirement** (P0 E-PERSON gate) | **IN 06.02** (basis (ii)) |
| **Shared wire contracts (SpanRef, Confidence, Finding, Source) + base `findings` + `finding_spans`** | F3,F4,F5,F6,F7,F17 produce; F8,F9,F10,F16 consume — PROMPT_STRATEGY (wire contracts); DATABASE_SCHEMA (base+detail); F3 §1 | ~10/17 (59%) as producers/consumers | **Documented shared contract** (rank-3 PROMPT_STRATEGY defines them as shared) | **IN 06.02** (contract + base tables only; per-kind detail tables stay in slices) |
| **Status lifecycle + SSE bus (Last-Event-ID resume) + `analysis_stage_runs`** | Every streaming/resumable surface F1,F2,F3,F4,F5,F6,F7,F8,F11 — STATE_ARCHITECTURE; SYSTEM_ARCHITECTURE; AI_ARCHITECTURE | ~9/17 (53%) directly; underlies all analysis | **Documented cross-feature requirement** (server-authoritative state) | **IN 06.02** (basis (ii)) |
| **Rate-limit middleware (classes A/B/C/D/P)** | All API endpoints — API_SPECIFICATION §8 (numbers `[ASSUMPTION—initial]`, deferred to Phase-07) | ~17/17 endpoints | ≥80% census (mechanism; numbers deferred) | **IN 06.02** (mechanism only; limits set in Phase-07) |
| **Design-system tokens + generic UI primitives (A-series, B1–B4, D1 shell, D2 badge)** | Every feature-slice frontend — DESIGN_SYSTEM; COMPONENT_LIBRARY; RESPONSIVE_SPECIFICATION; INTERACTION_SPECIFICATION | ~all frontends | ≥80% census | **IN 06.02** (generic primitives only; content-configs D3/D6/D7 built in slices) |
| ~~Evidence Drawer (D7) / Contest Flow (D6) / Anchor-Peek (D3) content-configs~~ | F6/F7 (D7), F9 (D6), F8 (D3) — COMPONENT_LIBRARY | ≤3/17 | Fails 80%; not a documented shared mandate | **DEFERRED to owning slice** |
| ~~Per-kind detail tables (finding_claim/support/structure/fallacy/credibility)~~ | one feature each | 1/17 each | Fails 80% | **DEFERRED to owning slice** |
| ~~Annotation composite / export pipeline / timeline join~~ | F10 / F12 / F16 only | 1/17 each | Fails 80% | **DEFERRED to owning slice** |
| ~~Generic “retention/consent service” as shared abstraction~~ | F14 only (F11 consumes deletion, but that is one consumer) | ≤2/17 | Fails 80%; would be prediction | **DEFERRED** — extract only if a 2nd consumer materialises |

**Net 06.02 set:** account/identity + AuthZ · F15/XA + per-stage schema validation · S9/XD gate · shared wire contracts + base findings/spans · status lifecycle + SSE + stage_runs · rate-limit middleware · design tokens + generic UI primitives. Every entry rests on a ≥80% census or a rank-3/rank-4 documented cross-feature mandate; nothing rests on prediction.

---

## 8b. Dangling-Document Confirmation (every mandated doc referenced ≥1×)

| Document | Referenced by | Cited in |
|---|---|---|
| 00-RESEARCH.md | F1a legal gate; F17/F5/F6 reliability ceilings | §1(F1a), §4(e), §5, §6 |
| ROADMAP.md | Stage-A scope; RK-6 counsel gate; cross-deps | §1(F1a), §4(e) |
| FEATURE_SPECIFICATION.md | dependency + AC extraction | §1, §4, §7 |
| AI_ARCHITECTURE.md | S0–S10 + XA–XD stage contracts | §1, §3, §4, §8 |
| PROMPT_STRATEGY.md | S4/S5 in-contracts; wire contracts | §1, §4, §8 |
| RAG_STRATEGY.md | citation gate (F6/S9) | §1, §5, §8 |
| SYSTEM_ARCHITECTURE.md | service boundaries; AuthN/Z core | §1, §2, §8 |
| DATABASE_SCHEMA.md | base+detail tables; deletion cascade §7 | §1, §2, §7b, §8 |
| API_SPECIFICATION.md | endpoints; §8 cross-cutting rules; rate classes | §1, §7, §8 |
| SECURITY_MODEL.md | accounts/ownership/injection/counsel gate | §1–§4, §8 |
| HALLUCINATION_PREVENTION.md | F15 pipeline-wide placement §7 | §3, §4, §8 |
| COMPONENT_LIBRARY.md | generic vs content-config primitives | §8 |
| DESIGN_SYSTEM.md | tokens | §8 |
| RESPONSIVE_SPECIFICATION.md | every feature-slice frontend step | §8, §10 (06.03+) |
| INTERACTION_SPECIFICATION.md | interaction behaviour for primitives/slices | §8, §10 |
| STATE_ARCHITECTURE.md | status lifecycle/SSE/error taxonomy | §1, §5, §8 |

**No mandated document is dangling** — each is referenced by ≥1 slice or by Shared Infrastructure, with a citation.

---

## 9. Open Ambiguities (genuinely unresolvable from current documentation)

Logged, not silently resolved. None of these block freezing this plan; each blocks or scopes a **specific later milestone** as noted.

1. **F8 ↔ F13 mutual dependency.** F8 §1 lists F13 as a dependency; F13 §1 lists F8. Resolvable direction not stated in a single doc. **Resolution proposed (not invented):** build F13’s categorical banding primitive as the confidence contract *consumed by* F8, co-located at Order #9–#10. *Blocks:* 06.03 slice ordering for F8/F13 — confirm at that milestone.
2. **F11 ↔ F14 mutual dependency + shared `DELETE /analyses/{id}` ownership.** F11 §1 depends on F14; FEATURE_SPECIFICATION F14 depends on F11. Both list `DELETE /analyses/{id}`. Account core (06.02) breaks the identity cycle; residual soft order (F14-feature before F11) and endpoint ownership are unresolved in a single doc. *Blocks:* 06.03 F11/F14 slice — confirm endpoint owner from API_SPECIFICATION at that milestone.
3. **F14 legal [UNVERIFIED] set** — GDPR/CCPA (NFR-9), §230/first-party (NFR-10), YouTube ToS (NFR-11), third-party non-consenting-voice enforcement (AMENDMENT-05-04). Counsel sign-off is a **hard pre-build gate** (SECURITY_MODEL §7; 00-RESEARCH §13). *Blocks:* F1a build **and** F14-feature build until counsel clears.
4. **AMENDMENT-05-02 (F7 `factor` enum column)** — highest-priority schema migration; enum values not enumerated in a rank-4 doc. *Blocks:* F7 slice migration.
5. **AMENDMENT-05-05 (F15 delimiter-collision escaping)** — wrapper mandated (HALLUCINATION_PREVENTION §7) but escaping scheme unspecified. *Blocks:* 06.02 F15 implementation detail (resolve in-build; no redesign).
6. **AMENDMENT-05-01 (F3 paraphrase-flag visual)** and **AMENDMENT-05-03 (F10 has no dedicated annotation component; composes C7/C5/B1)** — UI-composition decisions deferred to their slices.
7. **Rate-limit numeric values** — all `[ASSUMPTION—initial]`, deferred to Phase-07 (API_SPECIFICATION §8). 06.02 builds the mechanism only.
8. **Calibration audit set (F13/XB)** — Phase-02 artefact; banding thresholds depend on it. *Blocks:* F13 band calibration.

No dependency in §1 rests on an uncited assumption; every assumption surfaced during analysis is listed here rather than encoded as an edge.

---

## 10. Milestone Sequence (governs 06.01 → 06.N+1)

1. **06.01 Foundation** — repo init, config, lint/format, structured logging, error framework, CI. **No feature logic, no shared domain abstractions.**
2. **06.02 Shared Infrastructure** — exactly the §8 net set (account/identity + AuthZ · F15/XA + per-stage schema validation · S9/XD gate · shared wire contracts + base findings/spans · status lifecycle + SSE + stage_runs · rate-limit middleware · design tokens + generic UI primitives). **F14 account-core and F15 land here; F14 privacy/retention does not.**
3. **06.03+ Feature Slices** — one milestone per feature in the §1 order: **F1a → F1 → F2 → F3 → {F4, F6} → F5 → F7 → F17 → F13/F8 → {F16, F9, F10} → F14-feature → F11 → F12.** Each slice = DB + backend + AI + frontend (RESPONSIVE_SPEC + INTERACTION_SPEC) + tests, including ≥1 adversarial/insufficient-evidence hallucination test **shown, not asserted**, all spec edge cases, unit + integration + ≥1 E2E. Human Approval Block required between slices.
4. **06.N Integration** — cross-slice pipeline S0–S10 end-to-end + streaming/resume + evaluation E-codes.
5. **06.N+1 Final Verification** — Quality Gate, Definition of Complete, regression eval, counsel-gate confirmation.

---

## STOP — 06.00 complete

`BUILD_PLAN.md` is regenerated: every dependency is cited (§1), F14 (§2) and F15 (§3) placements are **decided**, every feature has complexity (§5) / risk (§6) / acceptance-criteria (§7) / rollback (§7b), no mandated document is dangling (§8b), the 80% rule is applied per shared component (§8), and Open Ambiguities (§9) contains only items genuinely unresolvable from current documentation.

**Halting here per PROMPT 06.** No Foundation (06.01) or implementation work begins without an explicit Approval Block command.
