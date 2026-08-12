# F3 Claim Extraction — implementation assumptions

Date: 2026-07-28

## Scope and semantics

- F3 extracts statements present in S1 transcript segments. It does not determine truth, support, evidence quality, credibility, fallacies, winners, or person-level conclusions.
- Each emitted claim has exactly one segment-local `SpanRef` in this milestone. Character offsets use JavaScript UTF-16 code units and are validated against the persisted segment before storage.
- Claim types are `factual`, `value`, `policy`, and `causal`. `check_worthy` is a routing signal for later F6 work, not a verdict. It can remain true only for factual or causal assertions; value and policy claims are conservatively forced false.
- Model extraction confidence is retained internally for evaluation and operations. Public API, SSE, and UI payloads omit it and expose no synthetic categorical band because no F3 calibration set exists yet.
- Low-confidence S1 attribution is persisted as an internal extraction signal so downstream stages can inherit the H4 caveat.

## Grounding and containment

- Transcript windows are assembled only on segment boundaries with deterministic overlap. Overlap duplicates are removed by stable segment/span/text identity, never by choosing a public-facing confidence score.
- The provider must return strict structured output. Application validation additionally rejects unknown segments, invalid offsets, empty anchors, non-verbatim text, excessive claims, and untraceable findings.
- Delimiter collisions are escaped without changing string length. Validation compares provider text against the escaped source and stores the corresponding original transcript substring.
- Paraphrased claims are fail-closed in F3. The schema retains a required `paraphrase` field, but `true` is rejected until a calibrated semantic-entailment gate and visual treatment are approved.
- Injection signals are persisted during every production stage invocation. Analyzed content has no tools, retrieval, or network authority and remains untrusted data.

## Provider and durability

- The core contract is provider-neutral. S2–S5 retain the OpenAI-compatible Responses adapter and strict `text.format` JSON Schema contract, while runtime requests use Groq at `https://api.groq.com/openai/v1/responses` with the pinned configurable model default `openai/gpt-oss-120b`.
- Provider, model, prompt version, schema version, window size, overlap, output limit, timeout, and retry counts are server-only configuration. `CLAIM_EXTRACTION_ENABLED=false` is the rollout-safe default; enabling S2–S5 requires `GROQ_API_KEY`.
- The existing durable analysis job carries a stage cursor. Successful S1 work atomically requeues the same job at S2 and resets per-stage attempts. Successful S2 advances to S3 when F4 is enabled; otherwise it advances directly to independent S6 when F6 is enabled. If neither downstream feature is enabled, S2 completes the job without claiming later disabled stages.
- Migration `0003_fixed_wolverine.sql` requeues legacy completed F2 jobs only when the analysis is `analyzing` and a transcript exists.
- S2 persistence is transactionally idempotent under a PostgreSQL advisory lock. Findings, claim details, and spans commit before durable `finding.batch` publication; replay uses persisted rows.
- Empty extraction is a valid complete S2 result and emits an empty batch. Terminal failure emits no claims and fails honestly; retryable provider/schema failures remain bounded.

## Current source

The adapter shape follows OpenAI's [Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs), including Responses `text.format`, strict JSON Schema, explicit refusal handling, and required `additionalProperties:false`. Content was rephrased for compliance with licensing restrictions.
