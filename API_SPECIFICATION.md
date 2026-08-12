# API_SPECIFICATION.md

**Project:** Debate Analyser v2 · **Phase:** 3 · **Date:** 2026-07-05 · **Rank:** 4
**Binding:** `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `AI_ARCHITECTURE.md` (stages), `FEATURE_SPECIFICATION.md`, `REQUIREMENTS.md`.
**Quality-Gate rule:** **every endpoint traces to a feature (F#) or pipeline stage; each states method, request/response schema, auth, errors, and rate-limit class.** No endpoint exists without an upstream driver.

## 0. Conventions
- Base: `/api/v1`. JSON over HTTPS. **Auth:** session cookie or bearer token (SECURITY_MODEL §1); `Auth` column below = `session` (owner), `public` (share surface), or `none`.
- **AuthZ:** every `analyses/{id}` resource is owner-scoped (403 on non-owner) except `/shared/{token}` (SECURITY_MODEL §2).
- **Standard errors** (all endpoints): `400` malformed, `401` unauthenticated, `403` not owner, `404` not found, `429` rate-limited (`Retry-After`), `500` internal. Endpoint-specific errors listed per row.
- **Rate-limit classes** (buckets per user; exact numbers **deferred to Phase-07 baseline**, `[ASSUMPTION — initial]` values given so the policy is concrete): **A-EXPENSIVE** (analysis create/resume/export — initial ~10/hr, the NFR-16 cost bound), **B-WRITE** (contests/annotations/shares/settings — ~120/hr), **C-READ** (GET reads — ~600/hr), **D-STREAM** (SSE connections — ~30 concurrent), **P-PUBLIC** (share view, per-IP — ~120/hr). Enforced at the API service (SCALABILITY_PLAN §queueing; SECURITY_MODEL §abuse).

---

## 1. Auth & account  *(F14)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/auth/session` | POST | none | `{credential}` → `{user, session}` | 401 invalid | B | F14 |
| `/auth/session` | DELETE | session | — → `204` | — | B | F14 |
| `/me` | GET | session | — → `{user, preferences}` | — | C | F14/F13 |
| `/me/consent` | POST | session | `{acceptable_use_version}` → `{accepted_at}` | 400 | B | **F1a/F14/NFR-8** (records acceptable-use ack) |
| `/me/settings` | PATCH | session | `{confidence_display?, jargon_plain_language?, reading_density?, accessibility_prefs?, default_retention_setting?}` → `{preferences}` | 400 | B | **F13/FR-19, NFR-12/13, F14** |
| `/me/data-export` | POST | session | — → `{export_job}` | — | A | **F14/NFR-9** (GDPR/CCPA data access) |
| `/me` | DELETE | session | `{confirm}` → `202` | 409 pending | B | **F14/NFR-9** account+data deletion (async cascade, DATABASE_SCHEMA §7) |

*Auth provider specifics `[ASSUMPTION — Phase-03 auth choice, SECURITY_MODEL §1]`.*

## 2. Ingest & analysis creation  *(F1/F1a → S0)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/uploads` | POST | session | `{filename, content_type, size}` → `{upload_url, media_key}` (pre-signed) | `413` too large, `415` unsupported type | B | **F1** large-file upload (§14) |
| `/analyses` | POST | session | `{source_type, media_key? , url?, paste_text?, title?, retention_setting?}` → `201 {id, status:"queued"}` | `415` unsupported, `422 rights_blocked{reason, alternative}`, `403 acceptable_use_required` | **A** | **F1/F1a** — runs S0 rights/acceptable-use gate synchronously; on pass, enqueues pipeline (async, SYSTEM_ARCHITECTURE §2) |

*`422 rights_blocked` carries a **specific** reason + alternative (F1a AC). `403 acceptable_use_required` if `/me/consent` not done (F1a).*

## 3. Analysis read & streaming  *(F8/F11/F16 → S1–S10)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/analyses/{id}` | GET | session | — → full `Analysis{status, overview, findings[], sources[], stage_runs[]}` | 404 | C | **F8/F11** authoritative object |
| `/analyses/{id}/stream` | GET (SSE) | session | — → event stream: `transcript.ready`, `finding.batch{stage,findings[]}`, `stage.status`, `analysis.done`, `error` | 404 | **D** | **F8/NFR-14/S10/S12** streaming; `Last-Event-ID` resumable (STATE_ARCHITECTURE §3) |
| `/analyses/{id}/transcript` | GET | session | — → `{segments[], speakers[]}` | 404 | C | **F2** anchor spine |
| `/analyses/{id}/findings` | GET | session | `?kind=&state=` → `{findings[]}` | 404 | C | **F3/F4/F5/F17/F7** per-tab findings |
| `/analyses/{id}/findings/{fid}/evidence` | GET | session | — → `{sources[with provenance, credibility, licensing_quote], spans[]}` | 404 | C | **F6/F7** Evidence Drawer (NSM moment) |
| `/analyses/{id}/timeline` | GET | session | — → `{points[{time_ms, finding_id}]}` | 404 | C | **F16** timeline |
| `/analyses/{id}/resume` | POST | session | — → `202 {status}` | `409` not resumable | **A** | **F11/NFR-15** resume partial/failed from last incomplete stage |

*Findings returned by these endpoints are **post-S9-gate only** — unanchored non-insufficient findings are never emitted (traceable-or-silent). No response ever contains a winner/aggregate score (FR-10).*

## 4. History  *(F11)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/analyses` | GET | session | `?query=&status=&cursor=&limit=` → `{items[], next_cursor}` | — | C | **F11** list/search |
| `/analyses/{id}` | DELETE | session | — → `202` | 404 | B | **F14/NFR-9** delete (async cascade) |
| `/analyses/{id}` | PATCH | session | `{title?, retention_setting?}` → `{analysis}` | 404, 400 | B | **F11/F14** rename, retention override |

## 5. Contest, annotation  *(F9/F10)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/findings/{fid}/contests` | POST | session | `{reason?}` → `201 {contest, finding_state:"contested"}` | 404 | B | **F9/FR-11** — sets visible contested state, records for review (S6) |
| `/analyses/{id}/contests` | GET | session | — → `{contests[]}` | 404 | C | F9 review |
| `/analyses/{id}/annotations` | POST | session | `{finding_id?, note?, visibility?, highlighted?}` → `201 {annotation}` | 404 | B | **F10** educator annotate/curate |
| `/annotations/{aid}` | PATCH/DELETE | session | `{...}` → `{annotation}` / `204` | 404 | B | **F10** |

## 6. Share & export  *(F12)*
| Endpoint | Method | Auth | Req → Res | Errors | Rate | Trace |
|---|---|---|---|---|---|---|
| `/analyses/{id}/shares` | POST | session | `{expires_at?}` → `201 {token, url, disclaimer_version, curation_applied}` | 404 | B | **F12** read-only link |
| `/analyses/{id}/shares/{sid}` | DELETE | session | — → `204` (sets `revoked_at`) | 404 | B | **F12/F14** revoke |
| `/shared/{token}` | GET | **public** | — → read-only `{analysis, disclaimer, limitations_url, curation_applied}` | `404`, `410` revoked/expired | **P** | **F12/NFR-8** — read-only; carries disclaimer + limitations; **no person-level verdict by construction** |
| `/analyses/{id}/exports` | POST | session | `{format}` → `202 {export_job}` | 404 | **A** | **F12** async render (auditable report) |
| `/analyses/{id}/exports/{eid}` | GET | session | — → `{status, download_url?}` | 404 | C | **F12** poll/download |

## 7. Static (not API — served content)
`/help` (how analysis works, how to read confidence, limitations — F13/transparency), `/legal` (Terms/Acceptable-Use/Disclaimers/Privacy — NFR-8, Research §13). Listed for completeness; not JSON endpoints.

---

## 8. Cross-cutting request rules
- **Injection containment (XA/F15/NFR-6):** ingested content submitted via `/analyses` and `/uploads` is stored as **data**, never interpreted as instructions; it is never reflected into a system prompt (SECURITY_MODEL §3). API validates only structural envelope, not content semantics.
- **Named-person (XD/FR-20):** the API never returns a person-level verdict; negative findings about `person_involved=true` are emitted only if XC-verified + anchored (enforced upstream at S9; the API is a pass-through of gated data).
- **Idempotency:** `POST /analyses`, `/resume`, `/exports` accept an `Idempotency-Key` header to make retries safe (SYSTEM_ARCHITECTURE §2).
- **Pagination:** cursor-based on all list endpoints (F11 scale).
- **Errors are specific, never fabricated success:** a failed stage surfaces via `stage.status` + partial results (NFR-15), not a silent 200 with invented content.

## 9. Quality-Gate evidence (this doc)
- Every endpoint has method, request/response schema, auth, errors, and a rate-limit class. ✅
- Every endpoint traces to a feature or pipeline stage (Trace column). ✅
- Expensive AI path is rate-limited (A-EXPENSIVE) per NFR-16; numbers flagged for Phase-07. ✅
- No endpoint can emit a winner/aggregate score/person-verdict (§8; FR-10/20). ✅
- Streaming endpoint matches the async design + real latency (SYSTEM_ARCHITECTURE §2). ✅

*End of API_SPECIFICATION.md*
