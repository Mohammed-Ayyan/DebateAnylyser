# F9/F10/F16 implementation assumptions

- F16 is a deterministic read projection over post-S9 public findings and transcript segment timestamps. It adds no table, AI stage, generated summary, causal interpretation, score, or finding kind.
- A timeline point uses the earliest valid transcript segment referenced by a finding and sorts by `time_ms`, then `finding_id`. Evidence-only findings without transcript spans are omitted rather than assigned a fabricated time.
- Timeline navigation selects the existing finding and transcript segment in the workspace; categorical confidence and finding state remain properties of the referenced public finding.
- F9 contest creation is owner-scoped because the current product has one analysis owner and no classroom/team/share-writer roles. Anonymous and read-only viewers cannot contest.
- A successful `201` response is the durable acknowledgement that a contest was recorded for review. The contest remains `open`; `acknowledged` and resolution states are reserved for a future trusted-reviewer authorization policy. Contestants cannot self-resolve.
- At most one active (`open` or `acknowledged`) contest exists per finding and user. Retried submissions return that durable contest and leave the original finding content unchanged.
- Contest creation atomically records the contest and changes only the base finding state to `contested`. A contest is accepted only for a finding that survived centralized S9 assembly.
- Contest reasons are bounded plain text treated as untrusted data. They are not sent to AI stages and are not included in structured logs.
- F10 treats “educator” as an owner use case; M9 does not invent role, cohort, student, grading, or classroom tables. Those remain F24 scope.
- `GET /analyses/{id}/annotations` is an additive owner-scoped API required for reload-safe editing; the original API specification only documented create/update/delete.
- A per-finding annotation is upserted for the owner. Analysis-level notes may be repeated. Notes are bounded plain text and rendered through React text nodes, never as markup.
- Annotation visibility and highlighting are curation overlays. They never mutate or delete the underlying finding. Owner reports apply the overlay and visibly disclose curation.
- F12 will persist `shares.curation_applied` when share/export tables are introduced. M9 does not create those future tables early.
- M9 adds no SSE event type. Contest and annotation writes reconcile through their authoritative HTTP responses and GET endpoints.
- Migration `0007_lovely_wolverine.sql` is additive and must be applied after the existing unapplied M7 migration in deployment order.