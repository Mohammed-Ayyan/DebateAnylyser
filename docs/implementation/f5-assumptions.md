# F5 Argument Structure (Toulmin) — implementation assumptions

Date: 2026-07-28

## Scope and semantics

- F5 maps possible Toulmin structure from completed S2 claims and S3 speaker-support findings. It does not assess truth, argument quality, credibility, persuasion effectiveness, winners, or people.
- Roles are the six schema-defined Toulmin roles: `claim`, `data`, `warrant`, `backing`, `qualifier`, and `rebuttal`. “Unclear structure” is represented by `findings.state='insufficient'`, not a seventh role.
- Every mapped graph has exactly one non-inferred, verbatim claim root. Every non-claim node participates in a directed edge whose role pair is fixed by the server.
- Relations are directed as follows: data supports claim; warrant warrants claim; backing backs warrant; qualifier qualifies claim; rebuttal rebuts claim. Self-references, duplicates, dangling references, and role-incompatible edges fail closed.

## Grounding and inference

- Every node has one exact transcript anchor. Non-inferred nodes are verbatim transcript text inside the claim or its S3 support span.
- Inferred nodes remain anchored to the claim/support context that motivated the inference, but use `anchor_role='inference_context'` so the UI never attributes inferred wording to the speaker.
- Inferred raw confidence is retained internally after a deterministic 0.5 reduction. No raw or synthetic categorical confidence is exposed publicly before F13 calibration.
- Missing attribution, inherited low-confidence claim input, insufficient S3 support, oversized context, provider uncertainty, or an unreliable graph produces one server-authored insufficient node anchored to the claim subject.
- Structure findings are framed as possible patterns and expose no aggregate score or person-level conclusion.

## Persistence and orchestration

- `finding_structure.source_claim_id` groups graph nodes by their originating S2 claim. This is an implementation extension to the abbreviated database specification and avoids ambiguous graph reconstruction.
- `anchor_role` distinguishes asserted content, inference context, and insufficient claim-subject anchors. This is required to satisfy both exact-span navigation and the prohibition against presenting inferred warrants as speaker statements.
- S3 advances the existing durable job to S4 only when `ARGUMENT_STRUCTURE_ENABLED=true`. Disabled S4 jobs remain unclaimed.
- Legacy completed S3 jobs are requeued at S4 while their analyses remain partial. The S4 worker transitions `partial → analyzing` only when the job is actually claimed, avoiding a false active state while rollout is disabled.
- S4 persistence is transactionally idempotent and stores findings, detail rows, spans, and edges atomically. Successful or replayed S4 work advances to independent S6 when F6 is enabled; otherwise it ends at `analysis.done{partial}`. A terminal S4 failure can still advance to S6 after valid input is loaded so evidence retrieval is not coupled to structure availability.

## API and UI

- `GET /api/v1/analyses/[id]/findings?kind=structure` returns post-traceability nodes plus `structure_edges`; state filters also remove edges whose endpoints are not returned.
- S4 SSE batches contain public nodes and associated graph edges without raw confidence.
- The transcript reader integrates Map/List parity from one graph model, visibly labels inferred and unclear nodes, and supports keyboard-native exact-span navigation. The feature remains hidden in practice until its disabled-by-default rollout flag is enabled.

## Current source

The adapter shape follows OpenAI's [Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs), including Responses `text.format`, strict JSON Schema, explicit refusal handling, and required `additionalProperties:false`. Content was rephrased for compliance with licensing restrictions.
