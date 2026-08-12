# F7 / S7 implementation assumptions

- F7 is independently feature-flagged by `SOURCE_CREDIBILITY_ENABLED` and remains disabled by default until an approved rater feed and licensing review exist.
- The canonical persistence model is relational and multi-rater: one `source_credibility_ratings` row per source, factor, category, method, and rater. There is no aggregate source score or oracle field.
- The fixed factor vocabulary is `editorial_standards`, `ownership_transparency`, `corrections_practice`, `method_transparency`, and `source_attribution`. A factor describes what a rater assessed; it is not a weight.
- Categories are only `higher`, `mixed`, and `lower`. Numeric values and raw provider confidence are rejected rather than transformed or exposed.
- Method provenance and rater reference are mandatory non-empty fields. Every public row is marked contested; disagreement is derived when raters assign different categories to the same factor.
- Credibility never filters, removes, or re-ranks verified evidence. The existing verified source ID is the S9 traceability anchor.
- Empty provider output is an honest completed result. The system never invents a rating.
- A provider-neutral configured HTTPS endpoint is used because no rater vendor is approved. Redirects are refused and source URLs are sent only to that explicitly configured service.
- S7 requires a completed S6 run. A terminal S7 failure preserves all verified evidence and ends at a partial-analysis boundary.
