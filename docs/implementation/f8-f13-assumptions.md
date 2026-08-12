# F8/F13 implementation assumptions

- A categorical confidence band is public only when a server stage already persisted it. M8 does not derive bands from raw model confidence because no approved human-labeled calibration artifact exists. Missing bands become `insufficient`.
- The legacy database enum value `numeric_optin` remains for migration compatibility but is neither returned nor accepted by the settings API. Public confidence is categorical only.
- S8 is deterministic and reconstructable. Its categorical read describes analysis coverage (`external_evidence_available`, `transcript_anchored`, `limited_coverage`, or `insufficient`), never debate quality, participant performance, truth, or a winner.
- S8 counts speaker-provided support separately from verified external sources. `absent` support never means false.
- S9 is the centralized public allow-list. Findings are emitted only when they have a valid transcript anchor, verified evidence reference, or explicit insufficient state. Every assembled finding has a non-null confidence category and no raw confidence.
- S10 emits only post-S9 overview/findings and closes the analysis as `complete` or `partial`. Earlier finding events remain internal durable progress records and are filtered from the public SSE stream.
- Deterministic overview reconstruction is preferred over speculative overview persistence; therefore M8 requires no database migration.
- The full workspace/report query convention is `?analysis=<uuid>`.
- Reports are read-only. PDF export and sharing remain disabled until F12; timeline and annotations remain unavailable until F16/F10.
- Existing workspace/report grid, panel/tab/modal geometry, monochrome typography, borders, and responsive breakpoints are preserved. M8 changes only data, wording, API integration, and operational states.
