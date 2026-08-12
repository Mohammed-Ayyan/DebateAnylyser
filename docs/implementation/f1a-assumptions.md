# F1a implementation assumptions

Status: implementation decisions for the Rights/ToS and Acceptable-Use Gate. Legal assertions remain subject to counsel approval.

- The feature is implemented but fail-closed by default. `LEGAL_COUNSEL_APPROVED=false`, an absent policy version, an empty URL-provider allowlist, and disabled source-type flags cannot permit analysis.
- Consent is accepted only for the exact active `LEGAL_POLICY_VERSION`, and only after that version is marked counsel-approved. Changing the configured version invalidates prior acknowledgement for future analyses without rewriting historical acceptance data.
- `/legal` intentionally labels unapproved content as a draft and states that analysis remains unavailable. Setting the approval flag is an operational assertion that counsel reviewed the exact published copy and version; configuration must not be changed independently of that review.
- F1 must call `assertRightsGate` synchronously before creating an analysis, requesting provider content, generating an upload target, or enqueueing work. This milestone deliberately does not add the F1 `/analyses` or `/uploads` endpoints.
- F1/provider adapters must supply explicit rights basis, access classification, intended use, and retrieval method. Unknown rights or access fail closed; public availability alone does not establish permission.
- URL host patterns are exact unless prefixed with `*.`. Wildcards match subdomains only, not the registrable host itself. Allowed providers remain empty until separately configured.
- YouTube-family hosts default to requiring an official API or official-caption retrieval method if they are later allowlisted. No scraping path is approved.
- URL checks in F1a are pre-fetch structural and policy checks. F1's network adapter must independently resolve DNS, reject private/reserved addresses after every redirect, and defend against DNS rebinding immediately before connection.
- Prohibited intended-use values are deterministic envelope metadata, not inferred by an LLM from submitted content. Harassment and persuasion optimization against a person return `403 acceptable_use`.
- Rights, private/restricted source, provider, and retrieval-method refusals return `422 rights_blocked` with a specific reason and safer alternative. Missing current consent returns `403 acceptable_use_required`.
- The legal page preserves the frozen visual system; no existing layout or component was redesigned.
