# DATABASE_SCHEMA.md

**Project:** Debate Analyser v2 · **Phase:** 3 · **Date:** 2026-07-05 · **Rank:** 4
**Binding:** `INFORMATION_ARCHITECTURE.md` §4 (object vocabulary), `PROMPT_STRATEGY.md` §1 (wire contracts SpanRef/Confidence/Finding/Source), `AI_ARCHITECTURE.md` (stage outputs), `FEATURE_SPECIFICATION.md` (F#), `REQUIREMENTS.md` (FR/NFR).
**Quality-Gate rule (self-imposed, from the prompt):** **every field is justified by a named feature/requirement/stage. No speculative fields.** Any column that could not be traced was not added. Engine: **relational (PostgreSQL-family)** — chosen for the strong referential integrity the traceable-or-silent invariant needs (foreign keys enforce "a Finding's anchor exists"); JSONB used only for genuinely open-shaped model signal blobs, never for traced first-class fields.

> **Object → table map (IA §4):** Analysis→`analyses`, Transcript→`transcripts`/`transcript_segments`/`speakers`, Finding→`findings`(+`finding_spans`, per-kind detail), Source→`sources`/`source_credibility_ratings`, Contest→`contests`. Supporting: `users`, `annotations`, `shares`, `exports`, `analysis_stage_runs`, `injection_flags`, `data_events`, `retention_schedule`.

Conventions: all tables have `id` (UUID, PK) and `created_at` unless noted; `*_id` are FKs; **soft-delete** via `deleted_at` where user-deletable (F14). Timestamps UTC.

---

## 1. Identity & account

### `users`  *(F14 accounts; F11 per-user history)*
| Field | Type | Justification (feature/req) |
|---|---|---|
| id | uuid PK | F14 |
| email | citext unique | F14 login identity |
| auth_provider_ref | text | F14 — external identity/credential handle (SECURITY_MODEL §1); no password hash stored here if a managed IdP is used `[ASSUMPTION — Phase-03 auth choice]` |
| acceptable_use_accepted_at | timestamptz null | **F1a/F14/NFR-8** — records acceptable-use acknowledgement before first analysis |
| acceptable_use_version | text null | F1a — which `/legal` version was accepted (auditability) |
| default_retention_setting | enum(`keep`,`30d`,`90d`,`delete_on_complete`) | **F14/NFR-9** — user-facing retention control |
| created_at / updated_at / deleted_at | timestamptz | F14 account lifecycle + deletion |

### `user_preferences`  *(F13/NFR-12/NFR-13 display & accessibility; IA §4)*
| Field | Type | Justification |
|---|---|---|
| user_id | uuid FK→users unique | one row per user |
| confidence_display | enum(`categorical`,`numeric_optin`) default `categorical` | **F13/FR-19** — categorical default; numeric opt-in only |
| jargon_plain_language | bool default false | **NFR-13**, IA §5 plain-language toggle |
| reading_density | enum(`comfortable`,`low_density`) default `comfortable` | **NFR-13** reading/low-density mode |
| accessibility_prefs | jsonb | **NFR-12** — reduced-motion/contrast/focus prefs (open-shaped UI prefs; not traced individually) |

*(Separate from `users` so preference growth never bloats the identity row; every column above traces to F13/NFR-12/13.)*

---

## 2. Analysis & transcript (the anchor spine)

### `analyses`  *(Analysis object, IA §4; F1/F8/F11/F14)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | IA §4 |
| owner_id | uuid FK→users | F11 per-user; AuthZ ownership (SECURITY_MODEL §2) |
| source_type | enum(`upload`,`url`,`paste`) | **F1** multi-format ingest |
| source_media_key | text null | **F1** object-store key for uploaded A/V/file (null for paste) |
| source_url | text null | **F1** submitted URL (null otherwise) |
| title | text | F8/F11 display + history search |
| status | enum(`queued`,`transcribing`,`analyzing`,`partial`,`complete`,`failed`) | **IA §4 status**; STATE_ARCHITECTURE §2 |
| rights_check_result | enum(`passed`,`blocked`) null | **F1a/S0** rights/ToS+acceptable-use gate outcome |
| rights_block_reason | text null | **F1a** specific refusal reason (AC: reasons are specific) |
| retention_setting | enum(`keep`,`30d`,`90d`,`delete_on_complete`) | **F14/NFR-9** — per-analysis override of user default |
| language | text null | F2 ASR language hint/detected |
| created_at / updated_at / deleted_at | timestamptz | F11/F14 lifecycle + deletion |

*No `score`/`winner`/`overall_rating` column exists — forbidden by FR-10/R1 (documented absence).*

### `transcripts`  *(Transcript object; F2)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | IA §4 |
| analysis_id | uuid FK→analyses unique | one transcript per analysis |
| source | enum(`asr`,`user_supplied`) | **F2** ASR output vs. pasted/fallback transcript (`MODEL_SELECTION.md` S1 fallback) |
| language | text null | F2 |

### `speakers`  *(F2 diarization; XD named-person)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| transcript_id | uuid FK→transcripts | F2 |
| label | text | **F2** diarized speaker label (e.g., "Speaker 1") |
| display_name | text null | F2 — user/educator-assigned name if known |
| is_named_person | bool default false | **XD/FR-20** — flags an identifiable individual → higher evidence threshold downstream |

### `transcript_segments`  *(F2/S1 — the span spine every Finding anchors to)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | **SpanRef.segment_id** (`PROMPT_STRATEGY.md` §1) |
| transcript_id | uuid FK→transcripts | F2 |
| speaker_id | uuid FK→speakers null | F2 diarization |
| idx | int | ordering |
| start_ms / end_ms | int | **F2/F16** time codes (timeline navigation) |
| text | text | **F2** segment text (anchor target) |
| asr_conf | real null | **F2/S1/H4** ASR confidence |
| diar_conf | real null | **F2/S1/H4** diarization confidence |
| low_conf | bool default false | **F2 AC** low-confidence span mark → downstream caveat inheritance (H4) |

*Index on (transcript_id, idx) and (transcript_id, start_ms) for timeline (F16) and span lookup.*

---

## 3. Findings (Finding object — base + per-kind detail)

Design: a **base `findings` table** carries the shared `Finding` contract (`PROMPT_STRATEGY.md` §1); **per-kind detail tables** carry only the columns that kind actually has (avoids nullable-sprawl and keeps "no speculative fields" honest — a fallacy column never sits empty on a claim row).

### `findings`  *(Finding object, IA §4; F3/F4/F5/F7/F17)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | IA §4 |
| analysis_id | uuid FK→analyses | ownership + query |
| kind | enum(`claim`,`support`,`structure`,`fallacy`,`credibility`) | **PROMPT_STRATEGY §1** Finding.kind (F3/F4/F5/F17/F7) |
| text | text | Finding.text — verbatim-or-marked-paraphrase |
| paraphrase | bool default false | **S2 validation** — flags non-verbatim text (H4/H6) |
| confidence_raw | real null | **XB input** — model-internal signal, **never displayed** |
| confidence_signals | jsonb null | XB — open-shaped raw signals (not a traced display field) |
| confidence_band | enum(`high`,`medium`,`low`,`insufficient`) null | **XB output / F13/FR-19** — the *displayed* calibrated categorical band |
| state | enum(`ok`,`insufficient`,`contested`) | **S9/F9** — insufficient-evidence & contested are first-class (NFR-17) |
| person_involved | bool default false | **XD/FR-20** — routes to higher threshold + XC before display |
| produced_by_stage | enum(`S2`,`S3`,`S4`,`S5`,`S6`,`S7`,`S8`) | provenance/observability (`analysis_stage_runs`) |
| created_at | timestamptz | |

**Enforced invariant (S9, `AI_ARCHITECTURE.md` §2 S9):** a `findings` row is only exposed via the API if it has ≥1 `finding_spans` row **or** ≥1 verified `finding_evidence` row **or** `state='insufficient'`. Enforced in the S9 gate (worker) **and** as a CHECK-backed application invariant; unanchored non-insufficient findings are never written to the exposed set.

### `finding_spans`  *(SpanRef; F3 anchor — enforces traceable-or-silent)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| finding_id | uuid FK→findings | |
| segment_id | uuid FK→transcript_segments | **SpanRef.segment_id** (F3 anchor) |
| start_char / end_char | int | **SpanRef** char offsets into segment text |

### Per-kind detail tables (only the columns that kind has)
**`finding_claim`** *(F3/S2)* — `finding_id`, `claim_type enum(factual,value,policy,causal)` (S2), `check_worthy bool` (S6 gating, RAG §2.1).
**`finding_support`** *(F4/S3)* — `finding_id`, `support_level enum(present,weak,absent)` (S3), `rationale text` (S3). *No truth field — support≠truth (H5).*
**`finding_structure`** *(F5/S4)* — `finding_id`, `role enum(claim,data,warrant,backing,qualifier,rebuttal)` (Toulmin, S4), `inferred bool` (S4 inferred-flag, H6). Edges: **`structure_edges`**(`analysis_id`, `from_finding_id`, `to_finding_id`, `relation`) for the Toulmin graph (F5).
**`finding_fallacy`** *(F17/S5)* — `finding_id`, `possible_type text` (S5 "possible <type>"), `taxonomy_ref text` (fixed taxonomy id, S5), `why text` (one-line rationale, S5). *Framed "possible", precision-first (NFR-2/18).*
**`finding_credibility`** *(F7/S7)* — `finding_id`, `source_id FK→sources` — links the credibility Finding to the source it describes.

---

## 4. Sources & evidence (external, verified-only)

### `sources`  *(Source object, IA §4; F6/S6)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | IA §4 |
| analysis_id | uuid FK→analyses | query/ownership |
| url | text | **F6** source location |
| retrieved_snippet | text | **RAG §4 / H1** — the **verbatim licensing quote** (anti-paraphrase-drift); the exact source sentence shown to the user |
| provenance | text | **F6/F7** — where it came from (tier + retrieval origin) |
| tier | enum(`T1`,`T2`,`T3`) | **RAG §1** corpus tier as provenance |
| resolves | bool | **S6/S9/H1** — URL/snippet resolution check; unresolved ⇒ dropped, never displayed |
| supports_relation | enum(`supports`,`refutes`,`neutral`,`insufficient`) | **S6** NLI verdict on the *specific* statement |
| licensing_quote_verified | bool default false | **RAG §4 step 2** — an exact licensing sentence was found; false ⇒ cannot attach |
| retrieved_at | timestamptz | **RAG §5 freshness** — provenance timestamp, shown to user |

*A source may attach to a Finding only if `resolves ∧ licensing_quote_verified ∧ supports_relation≠insufficient` (RAG §4 / PROMPT_STRATEGY S6 validation).*

### `finding_evidence`  *(M:N Finding↔Source; `evidence_refs`, PROMPT_STRATEGY §1)*
`finding_id` FK, `source_id` FK, PK(finding_id, source_id). Only verified sources are linked (S9).

### `source_credibility_ratings`  *(F7/S7 — categorical, contested, multi-rater)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| source_id | uuid FK→sources | F7 |
| level | enum(`higher`,`mixed`,`lower`) | **S7** categorical signal — never a numeric score (R7/§6.1) |
| method_provenance | text | **F7 AC/S7** — the named rating method (required, non-empty) |
| contested | bool default true | **F7/§6.1** — "this method is contested" note |
| rater_ref | text | **S7** — which rater (multiple rows ⇒ show disagreement) |

*Multiple rows per source is intentional — S7 "multiple raters shown when they disagree". No single-oracle column (R7).*

---

## 5. User interaction: contest, annotation, share, export

### `contests`  *(Contest object, IA §4; F9/FR-11)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | IA §4 |
| finding_id | uuid FK→findings | **F9** challenge target |
| user_id | uuid FK→users | F9 |
| reason | text null | F9 feedback text |
| state | enum(`open`,`acknowledged`,`resolved_valid`,`resolved_invalid`) | **F9/S6** review lifecycle; sets Finding `state='contested'` while open |
| resolution | text null | S6 acknowledgement/outcome |
| resolved_at | timestamptz null | S6; `resolved_valid` cases feed eval hard-cases (`EVALUATION.md` §4) |

### `annotations`  *(F10 educator curation)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| analysis_id | uuid FK→analyses | F10 |
| finding_id | uuid FK→findings null | F10 — note may attach to a finding or the analysis |
| author_id | uuid FK→users | F10 |
| note | text null | **F10** educator note/question |
| visibility | enum(`shown`,`hidden`) default `shown` | **F10** selective presentation (hide/show findings in curated view) |
| highlighted | bool default false | **F10** highlight for teaching |

*Curation never deletes underlying findings (F10 risk mitigation); `visibility=hidden` only affects the curated/shared view, and shares carry a `curation_applied` flag (below).*

### `shares`  *(F12 read-only share)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| analysis_id | uuid FK→analyses | F12 |
| token | text unique | **F12** unguessable share token (`/shared/{token}`) |
| created_by | uuid FK→users | F12 |
| disclaimer_version | text | **F12/NFR-8** — disclaimer + limitations link carried on the shared view |
| curation_applied | bool | **F10/F12** — shared view indicates curation was applied |
| expires_at | timestamptz null | F12/F14 — optional expiry (privacy) |
| revoked_at | timestamptz null | F12/F14 — revocation |

*`read_only` is not a column — it is an invariant of the share surface (always true, F12); storing it would be a speculative field.*

### `exports`  *(F12 auditable report)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| analysis_id | uuid FK→analyses | F12 |
| format | enum(`pdf`,`html`) | **F12** report format `[ASSUMPTION — final formats confirmed in Design/Build]` |
| status | enum(`rendering`,`ready`,`failed`) | F12 async render (SYSTEM_ARCHITECTURE §2) |
| storage_key | text null | F12 object-store key of the rendered artifact |
| disclaimer_version | text | **F12/NFR-8** disclaimer embedded |

---

## 6. Pipeline, security & compliance support tables

### `analysis_stage_runs`  *(NFR-15 resume/isolation; S12 timing; observability)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| analysis_id | uuid FK→analyses | |
| stage | enum(`S0`..`S10`) | **NFR-15** per-stage isolation/resume |
| status | enum(`pending`,`running`,`complete`,`failed`,`skipped`) | NFR-15 partial-resume; STATE_ARCHITECTURE §2 |
| attempt | int default 1 | idempotent retry key (SYSTEM_ARCHITECTURE §2) |
| started_at / finished_at | timestamptz null | **S12** time-to-first-insight measurement |
| error_class | text null | NFR-15 honest-failure surface (no fabricated result) |

### `injection_flags`  *(XA/F15/S10 — content-as-data security)*
`id`, `analysis_id` FK, `segment_id` FK→transcript_segments null, `signal text`, `created_at`. **F15/NFR-6** — suspicious-span flags from XA; feeds the E-INJECT monitor (`EVALUATION.md`).

### `data_events`  *(F14/NFR-9 — consent + deletion audit trail)*
| Field | Type | Justification |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→users null | |
| analysis_id | uuid FK→analyses null | |
| event_type | enum(`consent`,`deletion_requested`,`deletion_completed`,`export`,`share_created`,`share_revoked`) | **F14/NFR-9/NFR-8** — GDPR/CCPA-style auditable record of consent + deletion propagation |
| detail | jsonb null | event specifics |
| created_at | timestamptz | |

### `retention_schedule`  *(F14/NFR-9 storage-limitation)*
`id`, `analysis_id` FK, `delete_after timestamptz`, `reason enum(user_setting,ttl)`, `executed_at timestamptz null`. Drives the async retention/deletion job (SCALABILITY_PLAN §backups tension; SECURITY_MODEL §retention).

---

## 7. Deletion propagation (F14/NFR-9)
On `DELETE /analyses/{id}` or a due `retention_schedule` row, deletion **cascades**: `analyses` → transcripts/segments/speakers → findings (+detail/spans) → sources/credibility/evidence → contests/annotations/exports/injection_flags, **plus** object-store media/exports and RAG/prompt caches keyed to the analysis. A `data_events(deletion_completed)` row is written. Backups are handled per `SECURITY_MODEL.md` (deletion-vs-backup tension addressed there, not by resurrecting data).

## 8. What is deliberately absent (no speculative fields — Quality-Gate evidence)
- No `winner`, `overall_score`, `debate_rating` anywhere (FR-10/R1).
- No numeric per-source `credibility_score` (R7/§6.1) — only categorical + provenance + contested.
- No `verdict`/`is_true`/`is_liar` on findings/sources (R2/R5/§13) — only `supports_relation` on a *source*, and `support_level` (speaker support, not truth) on a *support finding*.
- No org/team/role tables (F24 deferred), no billing (out of scope), no researcher-API tokens (F26 deferred).
- Raw model self-confidence (`confidence_raw`) is stored for calibration but **never surfaced** — only `confidence_band` is exposed (XB/H3).

## 9. Quality-Gate evidence (this doc)
- Every field maps to a named feature/requirement/stage (§1–§6 trace columns). ✅
- Object vocabulary matches IA §4 and the PROMPT_STRATEGY wire contract. ✅
- Traceable-or-silent invariant realized at the storage layer (§3 invariant). ✅
- No speculative/forbidden fields (§8). ✅
- Retention/deletion & consent modeled (F14/NFR-9) (§6/§7). ✅

*End of DATABASE_SCHEMA.md*
