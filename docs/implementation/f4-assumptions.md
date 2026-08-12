# F4 Speaker Support Assessment — implementation assumptions

Date: 2026-07-28

## Scope and semantics

- F4 assesses only support supplied by the claim speaker inside the persisted transcript. It does not assess external truth, factual accuracy, evidence credibility, persuasion quality, fallacies, winners, or people.
- Public levels are `present`, `weak`, and `absent`. `insufficient` is a finding state with a null level, not a fourth level. `absent` means no attributable support was found in the examined transcript and never means false.
- Present and weak findings require exact same-speaker, non-low-confidence UTF-16 transcript spans. Absent and insufficient findings retain the claim span only as a `claim_subject` anchor, not as support evidence.
- Null speaker attribution and low-confidence claim sources deterministically become insufficient. Model-produced absent results are downgraded to insufficient whenever any transcript segment has uncertain speaker coverage.
- Rationale text is selected from bounded server-owned templates and reason codes. Model prose is never published or persisted as rationale.

## Context, provider, and safety

- Each claim is assessed against the complete attributable context for its speaker. If that context exceeds `SUPPORT_CONTEXT_MAX_CHARS`, the result is deterministically insufficient instead of truncating context and risking a false absent label.
- Empty S2 claim sets complete S3 without invoking a provider. Provider calls are grouped by speaker and bounded by `SUPPORT_MAX_CLAIMS_PER_CALL`.
- The provider contract uses strict structured output, exact claim-ID coverage, no tools, `store:false`, bounded retries and timeout, explicit refusal handling, and untrusted-content containment.
- Raw assessment confidence remains internal. Normal support findings expose no public confidence band until calibration; insufficient findings use only the existing categorical `insufficient` state/band.
- `SUPPORT_ASSESSMENT_ENABLED=false` is the rollout-safe default. Enabling requires completed S2 data and provider credentials.

## Durability and publication

- S2 atomically advances the durable job to S3 only when F4 is enabled. If F4 is disabled and independent F6 is enabled, S2 advances directly to S6. Disabled-stage jobs are not claimed by the unified worker and remain queued for an approved rollout.
- S3 persistence is transactionally idempotent under a PostgreSQL advisory lock. It requires exactly one support row per persisted S2 claim, at least one analysis-owned anchor per finding, and rejects partial replay sets.
- When F5 is disabled, S3 advances directly to independent S6 when F6 is enabled; otherwise stage completion and traceable findings are published before `analysis.done{partial}` at the F4 boundary. When F5 is enabled, S3 atomically advances to S4 without ending the analysis. A terminal S3 failure may still advance to S6 after valid S2 input is loaded, preserving stage-failure isolation.
- Retryable failures retain the analyzing state and requeue with bounded backoff. Terminal S3 failures preserve claims, emit an explicit notice, and produce a partial boundary only when a valid support input status was loaded.
- The generic owner-scoped, class-C `GET /api/v1/analyses/[id]/findings` endpoint supports `kind` and `state` filters. It returns only post-traceability public claim/support findings and never exposes raw model confidence.

## Current source

The adapter shape follows OpenAI's [Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs), including Responses `text.format`, strict JSON Schema, explicit refusal handling, and required `additionalProperties:false`. Content was rephrased for compliance with licensing restrictions.
