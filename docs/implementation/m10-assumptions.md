# M10 foundation assumptions

- Retention periods are calendar-duration intervals anchored to the immutable analysis `created_at`; renaming, resuming, and completion do not reset 30/90-day clocks.
- `delete_on_complete` is scheduled only for `complete`, never for `partial` or `failed`.
- Deletion has no legal-hold branch. Privacy deletion and account deletion do not consult publication or ingest counsel gates.
- Manual and account deletion return `202 accepted` after the transaction commits tombstones, share revocation, pipeline/operation cancellation, unique cleanup jobs, and a data event.
- Cleanup is retryable: source and export objects are deleted before the analysis row. Account rows are hard-deleted only after all owned analyses have been hard-deleted.
- Public share bearer tokens are never persisted; only a token hash is stored. Publication records snapshot policy/disclaimer versions and the limitations URL.
- M10 defines HTML report and JSON account-data export kinds. It does not claim PDF support.
- Publication gates are separate and default off. Account-data export enablement is independent of publication counsel approval; deletion is independent of every publication gate.
- History order is descending `(created_at, id)` and cursors contain exactly those keys. Tombstoned analyses never appear.
- Resume retains completed stage output and queues the earliest stage whose latest attempt is not complete. A row lock serializes competing resume requests, while matching idempotency keys replay safely.

## F12 share and export completion

- A share creation response is the only place its 32-byte base64url bearer token appears. The database stores only its SHA-256 digest; owner list/revoke responses never reconstruct a URL or token.
- Public share reads require the current sharing/publication gates plus the immutable policy snapshot, a live non-tombstoned analysis, an active non-expired share, and completed S9 assembly. Only owner-authored annotations/contests are projected; hidden findings are removed server-side and curation is disclosed.
- Report export accepts only `html`. PDF remains visibly unavailable and no substitute bytes or fabricated preview are produced. Export rows and operation jobs are created atomically, and worker completion/retry/failure updates both records together.
- Account-data export is gated only by `ACCOUNT_DATA_EXPORT_ENABLED`. Its pure projector deep-allow-lists account basics/preferences, active analysis metadata, owner-authored interactions, public post-S9 assembly, and optionally transcript text/timing/speaker labels.
- Immutable export object keys are deterministic per export ID so a worker retry cannot silently create a different artifact. Download URLs are generated only on authenticated owner detail/status reads and are never persisted.
- M10 operation claiming includes cleanup and both export types. Retention and cleanup remain ahead of report/account export jobs.
