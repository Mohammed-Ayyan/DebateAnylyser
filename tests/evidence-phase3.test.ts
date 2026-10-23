import { describe, expect, it, vi } from "vitest"

import { EvidenceError } from "@/lib/evidence/contracts"
import { alignLicensingQuote, OllamaEvidenceVerifier } from "@/lib/evidence/ollama-verifier"
import {
  extractPassageFromNormalized,
  extractSearchTerms,
  WikipediaEvidenceRetriever,
} from "@/lib/evidence/wikipedia-retriever"
import { validateEvidenceVerification } from "@/lib/evidence/verification"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"
import type { ResolvedEvidenceCandidate } from "@/lib/evidence/contracts"

const claimId = "00000000-0000-4000-8000-000000000001"
const analysisId = "00000000-0000-4000-8000-000000000002"

function mockClaim(overrides: Partial<InternalClaimFinding> = {}): InternalClaimFinding {
  return {
    id: claimId,
    analysis_id: analysisId,
    kind: "claim",
    text: "The Apollo 11 mission landed humans on the Moon in 1969.",
    paraphrase: false,
    confidence: { raw: 0.9 },
    confidence_band: null,
    state: "ok",
    person_involved: false,
    span_refs: [
      { segment_id: "00000000-0000-4000-8000-000000000003", start_char: 0, end_char: 50 },
    ],
    evidence_refs: [],
    produced_by_stage: "S2",
    claim: {
      claim_type: "factual",
      check_worthy: true,
      speaker_id: null,
      speaker_label: null,
    },
    ...overrides,
  }
}

function mockCandidate(sourceText: string): ResolvedEvidenceCandidate {
  return {
    url: "https://en.wikipedia.org/wiki/Apollo_11",
    finalUrl: "https://en.wikipedia.org/wiki/Apollo_11",
    passage: sourceText,
    sourceText,
    provenance: "Wikipedia: Apollo 11",
    tier: "T2",
    retrieved_at: new Date().toISOString(),
  }
}

describe("Wikipedia Evidence Retriever", () => {
  it("extracts meaningful search terms by removing punctuation and stop words", () => {
    const terms = extractSearchTerms(
      "In 1969, the Apollo 11 mission successfully landed on the Moon.",
    )
    expect(terms).toContain("1969")
    expect(terms).toContain("Apollo")
    expect(terms).toContain("mission")
    expect(terms).toContain("Moon")
    expect(terms).not.toContain("the")
    expect(terms).not.toContain("in")
  })

  it("extracts clean verbatim passages from normalized text matching query terms", () => {
    const normalized =
      "Introduction section. Apollo 11 was the American spaceflight that first landed humans on the Moon. Commander Neil Armstrong and lunar module pilot Buzz Aldrin landed on July 20, 1969. Later developments occurred."
    const passage = extractPassageFromNormalized(normalized, "Apollo 11 Moon 1969")
    expect(passage).toBeDefined()
    expect(normalized).toContain(passage!)
    expect(passage).toContain("Apollo 11")
  })

  it("returns candidate passages matching the retrieval schema", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes("action=query")) {
        return new Response(
          JSON.stringify({
            query: {
              search: [{ title: "Apollo 11" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      return new Response(
        "<html><body><p>Apollo 11 was the American spaceflight that first landed humans on the Moon in 1969.</p></body></html>",
        { status: 200, headers: { "content-type": "text/html" } },
      )
    })

    const retriever = new WikipediaEvidenceRetriever({
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 5000,
    })

    const result = (await retriever.retrieve({
      claimId,
      claimText: "Apollo 11 landed on the Moon in 1969.",
      maxCandidates: 2,
    })) as { candidates: Array<{ url: string; passage: string; tier: string }> }

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].url).toBe("https://en.wikipedia.org/wiki/Apollo_11")
    expect(result.candidates[0].tier).toBe("T2")
    expect(result.candidates[0].passage).toContain("Apollo 11")
  })

  it("returns zero candidates when no search results exist without failing", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ query: { search: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )

    const retriever = new WikipediaEvidenceRetriever({
      fetchImpl: fetchImpl as typeof fetch,
    })

    const result = (await retriever.retrieve({
      claimId,
      claimText: "Unknown non-existent mythic creature claims.",
      maxCandidates: 3,
    })) as { candidates: unknown[] }

    expect(result.candidates).toEqual([])
  })

  it("handles network errors and rate limiting with retryable EvidenceError", async () => {
    const fetchImpl = vi.fn(async () => new Response("Too Many Requests", { status: 429 }))
    const retriever = new WikipediaEvidenceRetriever({
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(
      retriever.retrieve({
        claimId,
        claimText: "Any claim text",
        maxCandidates: 2,
      }),
    ).rejects.toMatchObject({
      code: "EVIDENCE_RETRIEVER_UNAVAILABLE",
      retryable: true,
    })
  })

  it("handles request timeouts cleanly", async () => {
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((_, reject) => {
          setTimeout(() => reject(new Error("aborted")), 100)
        }),
    )
    const retriever = new WikipediaEvidenceRetriever({
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 20,
    })

    await expect(
      retriever.retrieve({
        claimId,
        claimText: "Timeout testing claim",
        maxCandidates: 1,
      }),
    ).rejects.toThrow(EvidenceError)
  })
})

describe("Ollama Evidence Verifier", () => {
  it("aligns verbatim sentences from passage when exact match or minor punctuation variation exists", () => {
    const passage =
      "He formalised the concepts of algorithm and computation with the Turing machine, a model of a general-purpose computer."
    const rawQuote =
      "He formalised the concepts of algorithm and computation with the Turing machine, a model of a general-purpose computer"
    const aligned = alignLicensingQuote(rawQuote, passage)
    expect(aligned).toBe(passage)
  })

  it("verifies a supporting claim and grounds the licensing quote", async () => {
    const sourcePassage =
      "He formalised the concepts of algorithm and computation with the Turing machine, a model of a general-purpose computer."
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              relation: "supports",
              licensing_quote: sourcePassage,
              confidence: 0.95,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )

    const verifier = new OllamaEvidenceVerifier({
      baseUrl: "http://localhost:11434",
      model: "phi3:mini",
      timeoutMs: 5000,
      maxOutputTokens: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    })

    const sourceBlock = JSON.stringify({
      claim: { id: claimId, text: "Alan Turing formalized computation.", person_involved: false },
      source: {
        url: "https://en.wikipedia.org/wiki/Alan_Turing",
        passage: sourcePassage,
        provenance: "Wikipedia",
        tier: "T2",
      },
    })

    const result = (await verifier.verify({
      sourceBlock,
      promptVersion: "v1",
      schemaVersion: "v1",
    })) as { relation: string; licensing_quote: string; confidence: number }

    expect(result.relation).toBe("supports")
    expect(result.licensing_quote).toBe(sourcePassage)
    expect(result.confidence).toBe(0.95)

    // Verify grounding pass
    const verified = validateEvidenceVerification(result, mockClaim(), mockCandidate(sourcePassage))
    expect(verified).toBeDefined()
    expect(verified?.relation).toBe("supports")
    expect(verified?.snippet).toBe(sourcePassage)
  })

  it("verifies a contradictory claim (refutes)", async () => {
    const sourcePassage = "Alan Turing was born in Maida Vale, London, England on 23 June 1912."
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              relation: "refutes",
              licensing_quote: sourcePassage,
              confidence: 0.9,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )

    const verifier = new OllamaEvidenceVerifier({
      baseUrl: "http://localhost:11434",
      model: "phi3:mini",
      timeoutMs: 5000,
      maxOutputTokens: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    })

    const sourceBlock = JSON.stringify({
      claim: {
        id: claimId,
        text: "Alan Turing was born in Paris, France.",
        person_involved: false,
      },
      source: {
        url: "https://en.wikipedia.org/wiki/Alan_Turing",
        passage: sourcePassage,
        provenance: "Wikipedia",
        tier: "T2",
      },
    })

    const result = (await verifier.verify({
      sourceBlock,
      promptVersion: "v1",
      schemaVersion: "v1",
    })) as { relation: string; licensing_quote: string }

    expect(result.relation).toBe("refutes")
    expect(result.licensing_quote).toBe(sourcePassage)
  })

  it("handles insufficient evidence and sets licensing_quote to null", async () => {
    const sourcePassage = "Turing worked as a cryptanalyst at Bletchley Park during the war."
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              relation: "insufficient",
              licensing_quote: null,
              confidence: 0.1,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )

    const verifier = new OllamaEvidenceVerifier({
      baseUrl: "http://localhost:11434",
      model: "phi3:mini",
      timeoutMs: 5000,
      maxOutputTokens: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    })

    const sourceBlock = JSON.stringify({
      claim: { id: claimId, text: "Alan Turing owned a bicycle.", person_involved: false },
      source: {
        url: "https://en.wikipedia.org/wiki/Alan_Turing",
        passage: sourcePassage,
        provenance: "Wikipedia",
        tier: "T2",
      },
    })

    const result = (await verifier.verify({
      sourceBlock,
      promptVersion: "v1",
      schemaVersion: "v1",
    })) as { relation: string; licensing_quote: string | null }

    expect(result.relation).toBe("insufficient")
    expect(result.licensing_quote).toBeNull()

    // validateEvidenceVerification drops insufficient without error
    const verified = validateEvidenceVerification(result, mockClaim(), mockCandidate(sourcePassage))
    expect(verified).toBeUndefined()
  })

  it("fails closed to insufficient when model hallucinates an ungrounded quote", async () => {
    const sourcePassage = "The city council voted on the annual road maintenance plan."
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify({
              relation: "supports",
              licensing_quote:
                "Completely fabricated quote about school funding that is nowhere in source.",
              confidence: 0.8,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )

    const verifier = new OllamaEvidenceVerifier({
      baseUrl: "http://localhost:11434",
      model: "phi3:mini",
      timeoutMs: 5000,
      maxOutputTokens: 1000,
      fetchImpl: fetchImpl as typeof fetch,
    })

    const sourceBlock = JSON.stringify({
      claim: { id: claimId, text: "School funding increased.", person_involved: false },
      source: {
        url: "https://example.com/source",
        passage: sourcePassage,
        provenance: "Test",
        tier: "T2",
      },
    })

    const result = (await verifier.verify({
      sourceBlock,
      promptVersion: "v1",
      schemaVersion: "v1",
    })) as { relation: string; licensing_quote: string | null }

    // Aligner fails closed to insufficient when quote cannot be grounded
    expect(result.relation).toBe("insufficient")
    expect(result.licensing_quote).toBeNull()
  })

  it("rejects malformed non-JSON input with request rejected error", async () => {
    const verifier = new OllamaEvidenceVerifier({
      baseUrl: "http://localhost:11434",
      model: "phi3:mini",
      timeoutMs: 5000,
      maxOutputTokens: 1000,
    })

    await expect(
      verifier.verify({
        sourceBlock: "not-json-text",
        promptVersion: "v1",
        schemaVersion: "v1",
      }),
    ).rejects.toMatchObject({
      code: "EVIDENCE_VERIFIER_REQUEST_REJECTED",
      retryable: false,
    })
  })
})
