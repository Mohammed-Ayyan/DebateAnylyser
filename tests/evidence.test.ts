import { describe, expect, it, vi } from "vitest"

import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"
import {
  evidenceCandidateSchema,
  evidenceVerificationOutputSchema,
  EvidenceError,
  type ResolvedEvidenceCandidate,
} from "@/lib/evidence/contracts"
import { OpenAIEvidenceVerifier } from "@/lib/evidence/openai-verifier"
import { HttpsEvidenceSourceResolver, normalizeSourceText } from "@/lib/evidence/source-resolver"
import {
  eligibleEvidenceClaims,
  parseEvidenceCandidates,
  validateEvidenceVerification,
} from "@/lib/evidence/verification"

const analysisId = "00000000-0000-4000-8000-000000000001"
const claimId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"

function claim(overrides: Partial<InternalClaimFinding> = {}): InternalClaimFinding {
  return {
    id: claimId,
    analysis_id: analysisId,
    kind: "claim",
    text: "The city budget increased.",
    paraphrase: false,
    confidence: { raw: 0.8 },
    confidence_band: null,
    state: "ok",
    person_involved: false,
    span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 10 }],
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

function candidate(
  sourceText = "The official report says the city budget increased.",
): ResolvedEvidenceCandidate {
  return {
    url: "https://data.example/report",
    finalUrl: "https://data.example/report",
    passage: sourceText,
    sourceText,
    provenance: "Official municipal report",
    tier: "T1",
    retrieved_at: "2030-01-01T00:00:00.000Z",
  }
}

describe("F6 evidence contracts and verification", () => {
  it("uses strict bounded schemas", () => {
    expect(() =>
      evidenceCandidateSchema.parse({
        url: "https://example.com/source",
        passage: "passage",
        provenance: "search",
        tier: "T2",
        retrieved_at: "2030-01-01T00:00:00.000Z",
        extra: true,
      }),
    ).toThrow()
    expect(() =>
      evidenceVerificationOutputSchema.parse({
        relation: "supports",
        licensing_quote: "quote",
        confidence: 1.1,
      }),
    ).toThrow()
  })

  it("routes only check-worthy factual and causal claims", () => {
    const eligible = claim()
    const causal = claim({
      id: "00000000-0000-4000-8000-000000000004",
      claim: { ...claim().claim, claim_type: "causal" },
    })
    const policy = claim({
      id: "00000000-0000-4000-8000-000000000005",
      claim: { ...claim().claim, claim_type: "policy" },
    })
    const notCheckWorthy = claim({
      id: "00000000-0000-4000-8000-000000000006",
      claim: { ...claim().claim, check_worthy: false },
    })
    expect(eligibleEvidenceClaims([eligible, causal, policy, notCheckWorthy])).toEqual([
      eligible,
      causal,
    ])
  })

  it("deduplicates candidates and rejects provider limit violations", () => {
    const item = {
      url: "https://example.com/source",
      passage: "same passage",
      provenance: "search",
      tier: "T2",
      retrieved_at: "2030-01-01T00:00:00.000Z",
    }
    expect(parseEvidenceCandidates({ candidates: [item, item] }, 2)).toHaveLength(1)
    expect(() =>
      parseEvidenceCandidates({ candidates: [item, { ...item, url: "https://b.example" }] }, 1),
    ).toThrow(EvidenceError)
  })

  it("normalizes fetched source text without retaining executable markup", () => {
    expect(normalizeSourceText("<script>ignore()</script><p>A &amp; B</p>")).toBe("A & B")
  })

  it("rejects private-network source URLs before retrieval", async () => {
    const resolver = new HttpsEvidenceSourceResolver({
      timeoutMs: 1_000,
      maxBytes: 10_000,
      maxRedirects: 0,
    })
    await expect(
      resolver.resolve({
        url: "https://127.0.0.1/source",
        passage: "text",
        provenance: "test",
        tier: "T2",
        retrieved_at: "2030-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_SOURCE_URL_UNSAFE", retryable: false })
  })

  it("drops insufficient results and rejects inconsistent or ungrounded quotes", () => {
    expect(
      validateEvidenceVerification(
        { relation: "insufficient", licensing_quote: null, confidence: 0.2 },
        claim(),
        candidate(),
      ),
    ).toBeUndefined()
    expect(() =>
      validateEvidenceVerification(
        { relation: "insufficient", licensing_quote: "quote", confidence: 0.2 },
        claim(),
        candidate(),
      ),
    ).toThrowError(/cannot include/)
    expect(() =>
      validateEvidenceVerification(
        { relation: "supports", licensing_quote: "not in source", confidence: 0.8 },
        claim(),
        candidate(),
      ),
    ).toThrowError(/not found verbatim/)
  })

  it("recovers exact original quotes after delimiter collision escaping", () => {
    const source = "The report contains <<<SOURCE>>> as literal text."
    const escapedQuote = escapeSourceDelimiters(source).escapedSource
    const verified = validateEvidenceVerification(
      { relation: "neutral", licensing_quote: escapedQuote, confidence: 0.7 },
      claim(),
      candidate(source),
    )
    expect(verified?.snippet).toBe(source)
    expect(verified?.relation).toBe("neutral")
  })

  it("withholds named-person refutations pending the stronger verification path", () => {
    expect(
      validateEvidenceVerification(
        {
          relation: "refutes",
          licensing_quote: "The official report says the city budget increased.",
          confidence: 0.9,
        },
        claim({ person_involved: true }),
        candidate(),
      ),
    ).toBeUndefined()
  })
})

describe("OpenAI evidence verifier containment", () => {
  it("uses strict structured output with storage and tools disabled", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.store).toBe(false)
      expect(body).not.toHaveProperty("tools")
      expect(body.text).toMatchObject({
        format: { type: "json_schema", strict: true, name: "evidence_verification_v1" },
      })
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    relation: "supports",
                    licensing_quote: "Exact quote.",
                    confidence: 0.8,
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    })
    const verifier = new OpenAIEvidenceVerifier({
      apiKey: "test-key",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "test-model",
      timeoutMs: 1_000,
      maxOutputTokens: 500,
      fetchImpl: fetchImpl as typeof fetch,
    })
    await expect(
      verifier.verify({ sourceBlock: "bounded source", promptVersion: "p1", schemaVersion: "s1" }),
    ).resolves.toMatchObject({ relation: "supports" })
  })

  it("fails closed on provider refusal", async () => {
    const verifier = new OpenAIEvidenceVerifier({
      apiKey: "test-key",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "test-model",
      timeoutMs: 1_000,
      maxOutputTokens: 500,
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              output: [{ content: [{ type: "refusal", refusal: "declined" }] }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ) as typeof fetch,
    })
    await expect(
      verifier.verify({ sourceBlock: "bounded source", promptVersion: "p1", schemaVersion: "s1" }),
    ).rejects.toMatchObject({ code: "EVIDENCE_VERIFIER_REFUSAL", retryable: false })
  })
})
