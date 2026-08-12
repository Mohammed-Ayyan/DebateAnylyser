# F17 / S5 implementation assumptions

- F17 is independently feature-flagged by `FALLACY_DETECTION_ENABLED` and remains disabled by default until precision calibration and the XC verification path are approved.
- The fixed taxonomy is versioned as `f17-s5-v1` and deliberately narrow. It includes four logical-fallacy patterns, three rhetoric patterns, and three misleading/incomplete patterns.
- Model output may contain only a taxonomy ID, exact UTF-16 transcript span, `possible` framing, person flag, and internal confidence. Labels and one-line explanations are server-owned taxonomy text.
- Precision is favored over recall. Candidates below the configured threshold are omitted, and an empty finding set is a valid completed result.
- Every displayed finding has one exact transcript anchor. Low-ASR spans inherit a visible reliability caveat.
- Because independent XC verification is not implemented, every person-involved candidate is dropped before persistence. This is a fail-closed activation constraint, not a claim that person-related reasoning cannot be analyzed later.
- Public findings use only categorical confidence and never include raw model confidence or model-authored verdict prose.
- S5 consumes completed S2 claims and S4 structure; it does not feed S4. Terminal S5 failure may continue independent S6 evidence retrieval after valid input has loaded.
- Findings are framed as possible and contestable. They never assert that a speaker or statement is definitively fallacious, deceptive, or false.
