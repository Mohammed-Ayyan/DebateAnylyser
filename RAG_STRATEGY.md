# RAG_STRATEGY.md

**Project:** Debate Analyser v2 · **Phase:** 2 · **Date:** 2026-07-04 · **Rank:** 3
**Binding:** `00-RESEARCH.md` (esp. §4, §6, §15 H1), Phase-01 (locked #4: retrieval + shown provenance + contestation, attribution verified), `AI_ARCHITECTURE.md` S6/S7/S9.
**Scope:** source corpus · retrieval method · credibility ranking · freshness · **citation traceability back to the retrieved source (no paraphrase drift).**

## 0. Non-negotiable principle
**A citation may attach to a Finding only if the system has independently verified that the *retrieved source text* supports the *specific statement*, and can quote the exact licensing sentence.** Model-emitted citations are never trusted (Research §6.2 ~51.5% supported; §15 H1 fabrication common). This is the H1 mitigation and the guarantee of "full traceability" required by the Quality Gate.

---

## 1. Source corpus (hybrid, provenance-tagged)
Locked #4 chose **open retrieval with shown provenance + contestation**; a bounded corpus is a *supplement*, not a replacement. Tiers (every source keeps its tier as provenance):

| Tier | Contents | Role | Why |
|---|---|---|---|
| **T0 — the transcript itself** | S1 segments | primary anchor for *support* (S3), not external truth | anchor spine (IA §2) |
| **T1 — curated reference set** | encyclopedic/reference works, official statistics/primary-source datasets, standards bodies | preferred first-hop evidence | auditable, stabler (Research §4 freshness/limits) |
| **T2 — open web retrieval** | live web/search results | coverage beyond T1 | breadth; needed for current claims |
| **T3 — fact-check corpora** | ClaimReview / published fact-checks (Research §4.2) | claim-matching (reuse prior checks) | leverages existing verified checks |

**Ground-truth stance:** none of these is treated as an oracle. T1–T3 carry provenance and, where credibility is shown, a **contested** flag (§3). "No reliable source found" is a valid outcome (Research §2.3 recall ceiling ~83.5%).

**Open ambiguity O-AI1 (logged):** the *specific* T1 reference works and T3 feeds are an implementation/licensing decision for Phase 03; this doc fixes the *tiering + verification principle*, not vendor names (avoids inventing sources — GLOBAL RULES).

---

## 2. Retrieval method (per check-worthy claim from S2)
1. **Check-worthiness filter** — only factual, externally-verifiable claims enter retrieval (value/policy claims route to support-only S3). Reduces cost + false-verdict surface (Research §4.1).
2. **Claim-matching first (T3)** — if a published fact-check already covers a near-duplicate claim, surface it (with its provenance) before fresh retrieval. *Rationale:* cheaper + leverages human-verified checks (Research §4.2).
3. **Query generation** — LLM turns the claim into 1–3 retrieval queries (entities, dates, quantities), grounded strictly in the claim text.
4. **Hybrid retrieval** — lexical (BM25-style) + dense/semantic over T1, then T2 web (Research §4.1 recipe). Rank by relevance × source-tier preference (T1 > T3 > T2), not by credibility (credibility is shown, never used to silently suppress — §6.1).
5. **Evidence selection** — top-k passages per query; deduplicate by source.
6. **Verification gate (the core step)** — see §4. Only verified passages become `Source` objects attachable to the Finding.
7. **Outcome** — `supports / refutes / neutral / insufficient`, or **"unverified — no reliable source found."**

**Trade-off (Research §14):** multi-hop retrieval + verification is latency- and cost-heavy → run **only** for check-worthy claims, cache aggressively (`MODEL_SELECTION.md`), stream results as each claim resolves. Alternatives rejected: retrieve-for-every-claim (too costly, low value on non-factual claims); no-retrieval/model-memory (H1/H5 — the whole reason retrieval exists).

---

## 3. Credibility ranking (categorical, contested, provenance-shown)  *(S7)*
- Each attached Source gets a **categorical** signal **Higher / Mixed / Lower**, derived from **transparent, named methods** (e.g., independent rating systems from Research §6.1) — **each shown with its method provenance and a "this method is contested" note**, and multiple raters shown when they disagree.
- **Credibility never silently filters or re-ranks final evidence.** It is *displayed alongside* the source so the user judges it (Research §6.1: no neutral oracle; locked #4). Retrieval preference (§2.4) uses *tier*, not credibility, to avoid hidden bias.
- **Rejected:** single numeric credibility score / a "trust this source" oracle (R7, §6.1).
- **Mitigates:** legal §13, H3 (no false-precision authority).

---

## 4. Citation traceability — no paraphrase drift (the H1 mitigation)
For each candidate (Finding-statement, Source-passage):
1. **Resolution check** — the source URL/passage must resolve and the quoted snippet must exist verbatim in the fetched source. Unresolvable ⇒ **dropped + flagged**, never displayed (S9). *This alone kills fabricated-URL citations.*
2. **Entailment (NLI) check** — an independent judgment must return that the passage **supports / refutes** the *specific* statement, **and must quote the exact sentence** in the source that licenses it. No verbatim licensing quote ⇒ cannot attach.
3. **Anti-drift binding** — the stored `Source.retrieved_snippet` is the **verbatim licensing quote**; the UI links the Finding → that quote → the source location. The user always sees *the actual source sentence*, not the model's paraphrase of it (defeats paraphrase drift, Research §6.2).
4. **Person guard (XD)** — if the statement concerns a named individual and the relation is negative (refutes), the **higher evidence threshold** + XC verification apply before display (Research §13).

**Result:** every displayed external claim is traceable **statement → licensing quote → resolvable source with provenance + contestation.** Findings that fail verification become **Insufficient-Evidence** cards, not guesses. This is the mechanical guarantee behind the Quality-Gate item "citation strategy guarantees full traceability." ✅

---

## 5. Freshness handling
- **Query-time retrieval** (not a stale index) for T2/T3 so time-sensitive claims get current evidence (Research §4.3 freshness).
- **Retrieval timestamp** stored on every `Source` (provenance) and shown; a source is labeled with its publish/retrieved date so users weigh recency.
- **Claim recency signal** — claims referencing "current"/dated facts prefer fresh retrieval over cached T1.
- **Cache TTL** — verified (claim→source) results cached with a bounded TTL; time-sensitive claims get short TTLs. (Cost control per Research §14 without serving stale verdicts.)
- **Rejected:** a fixed snapshot corpus only (rejected — staleness on current-event debates, Research §4.3).

## 6. Failure & honesty behavior (Journeys E-EVIDENCE)
- No resolving/verifying source ⇒ **"Unverified — no reliable source found."**
- Only contested/disagreeing sources ⇒ **"Sources disagree"** state with each source's provenance (teachable, not a dead end).
- Retrieval stage error ⇒ isolate; other stages proceed (NFR-15).

## 7. Risk coverage (Quality-Gate evidence)
| Research risk | Mitigation here |
|---|---|
| H1 fabricated citations | §4 resolution + NLI + verbatim-quote gate; drop-unresolved |
| H5 fabricated facts in verdicts | §2 check-worthiness + §4 verify + "unverified" outcome |
| §6.1 no neutral credibility oracle | §3 categorical + provenance + contested; credibility never silently filters |
| §4.3 freshness | §5 query-time retrieval + timestamps + TTL |
| §13 defamation | §4.4 person guard (higher threshold + XC) |

*End of RAG_STRATEGY.md*
