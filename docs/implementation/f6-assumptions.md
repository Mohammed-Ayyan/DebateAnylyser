# F6 Verified Evidence Retrieval — implementation assumptions

Date: 2026-08-09

## Scope and semantics

- F6 retrieves evidence only for check-worthy S2 factual and causal claims. Value, policy, and non-check-worthy claims are ineligible; an empty eligible set completes S6 without provider calls.
- A relation (`supports`, `refutes`, or `neutral`) describes one exact claim/source pairing. It is not an overall true/false result, credibility score, speaker judgment, or person-level verdict.
- The normal no-source result is `unverified — no reliable source found`. Unverified candidates are dropped rather than persisted or exposed as citations.
- Named-person `refutes` results are withheld until the stronger XC/multi-source path exists. This fail-closed rule does not suppress non-negative relations.

## Retrieval and verification gate

- Retrieval is provider-neutral through a configured HTTPS endpoint. Candidates are bounded, strictly parsed, deduplicated, and retain provenance tier and retrieval time.
- Source resolution permits only HTTPS on port 443, rejects credentials and private/reserved hosts, validates every DNS answer, pins the selected public address for the TLS request, revalidates redirects, and bounds redirects, time, bytes, and content types.
- A candidate passage must occur verbatim in normalized fetched source text. The independent verifier receives only bounded untrusted claim/source data, uses no tools or external knowledge, and must return strict structured output.
- Persistence requires a resolvable URL, a non-empty exact licensing quote found in both the candidate passage and fetched source, and a non-`insufficient` relation. Delimiter-collision recovery is offset-preserving and rechecked against the escaped quote before storing original text.
- Raw verification confidence is retained only in private `sources.verification_signals`; public API, SSE, and UI payloads omit it.

## Durability and orchestration

- F6 is rollout-disabled by default. Disabled S6 jobs remain queued and are not claimed by the unified worker.
- S2 routes directly to S6 when F4 is disabled. S3 routes to S6 when F5 is disabled, and S4 routes to S6 when enabled. Terminal S3/S4 failures may continue to independent S6 after valid input was loaded.
- Verified source/link persistence and S6 stage completion commit atomically under a PostgreSQL advisory lock. This makes both verified and empty outcomes crash-replayable without repeating provider calls. Replay publishes only persisted verified sources. Retryable failures use bounded backoff; terminal failure preserves earlier findings and ends partial.
- Candidate-local transient failures do not discard another candidate that verifies. If every candidate fails transiently, the stage retries instead of publishing an empty success.

## API and UI

- `GET /api/v1/analyses/[id]/findings/[fid]/evidence` is authenticated, owner-scoped, class-C limited, and returns 404 for a finding outside the analysis. It returns claim spans, verified sources, and `verified | unverified` state.
- The generic findings endpoint reports S6 status and attaches only verified source IDs to post-traceability public claims.
- The existing monochrome source explorer now loads real verified evidence and exposes provenance, tier, relation, exact quote, retrieval time, loading/error/empty states, copy, and source navigation without numeric credibility semantics.

## Current source

The verifier adapter follows OpenAI's [Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs): Responses `text.format`, strict JSON Schema, explicit refusal handling, no tools, and `store:false`. Content was rephrased for compliance with licensing restrictions.
