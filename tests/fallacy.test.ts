import { describe, expect, it, vi } from "vitest"

import { FALLACY_TAXONOMY_VERSION } from "@/lib/fallacy/taxonomy"
import { OpenAIFallacyDetectionProvider } from "@/lib/fallacy/openai-provider"
import {
  EMPTY_FALLACY_MESSAGE,
  LOW_ASR_CAVEAT,
  validateFallacyDetection,
} from "@/lib/fallacy/validation"

const segmentId = "00000000-0000-4000-8000-000000000001"
const anchor = "Either we adopt this plan today, or the city will collapse."
const prefix = "😀 "
const segmentText = `${prefix}${anchor}`
const anchorStart = prefix.length

function segments(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: segmentId,
      text: segmentText,
      lowConfidence: false,
      personInvolved: false,
      ...overrides,
    },
  ]
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    taxonomy_version: FALLACY_TAXONOMY_VERSION,
    findings: [
      {
        taxonomy_id: "LF_FALSE_DILEMMA",
        segment_id: segmentId,
        start_char: anchorStart,
        end_char: anchorStart + anchor.length,
        text: anchor,
        framing: "possible",
        person_involved: false,
        confidence: 0.96,
        ...overrides,
      },
    ],
  }
}

describe("F17/S5 strict fallacy domain validation", () => {
  it("accepts an exact UTF-16 anchor and uses only server-owned public prose", () => {
    const result = validateFallacyDetection(candidate(), segments())
    expect(result.findings[0]).toMatchObject({
      taxonomyId: "LF_FALSE_DILEMMA",
      possibleType: "Possible false dilemma",
      span: {
        text: anchor,
        startChar: anchorStart,
        endChar: anchorStart + anchor.length,
      },
      contestable: true,
      personInvolved: false,
    })
    expect(result.findings[0].why).toMatch(/may present/)
  })

  it("rejects an unknown taxonomy ID", () => {
    expect(() =>
      validateFallacyDetection(candidate({ taxonomy_id: "LF_INVENTED" }), segments()),
    ).toThrow()
  })

  it("rejects a non-exact transcript span", () => {
    expect(() =>
      validateFallacyDetection(candidate({ text: `${anchor} invented` }), segments()),
    ).toThrow()
  })

  it("rejects assertive framing and drops every person-involved result", () => {
    expect(() =>
      validateFallacyDetection(candidate({ framing: "assertive" }), segments()),
    ).toThrow()
    expect(
      validateFallacyDetection(candidate({ person_involved: true }), segments()).findings,
    ).toEqual([])
    expect(
      validateFallacyDetection(candidate(), segments({ personInvolved: true })).findings,
    ).toEqual([])
  })

  it("propagates a low-ASR reliability caveat", () => {
    const finding = validateFallacyDetection(candidate(), segments({ lowConfidence: true }))
      .findings[0]
    expect(finding.caveat).toBe(LOW_ASR_CAVEAT)
  })

  it("returns an honest empty result and abstains below the precision threshold", () => {
    const explicitEmpty = validateFallacyDetection(
      { taxonomy_version: FALLACY_TAXONOMY_VERSION, findings: [] },
      segments(),
    )
    expect(explicitEmpty).toMatchObject({ findings: [], message: EMPTY_FALLACY_MESSAGE })
    expect(validateFallacyDetection(candidate({ confidence: 0.899 }), segments())).toMatchObject({
      findings: [],
      message: EMPTY_FALLACY_MESSAGE,
    })
  })

  it("never leaks raw model confidence or model-owned prose", () => {
    const finding = validateFallacyDetection(candidate(), segments()).findings[0]
    expect(finding).not.toHaveProperty("confidence")
    expect(finding).not.toHaveProperty("raw")
    expect(JSON.stringify(finding)).not.toContain("0.96")
    expect(() =>
      validateFallacyDetection(candidate({ why: "This definitely is a fallacy." }), segments()),
    ).toThrow()
  })
})

describe("F17/S5 OpenAI Responses adapter", () => {
  it("uses strict structured output without tools or storage", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            status: "completed",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: JSON.stringify(candidate()) }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const provider = new OpenAIFallacyDetectionProvider({
      apiKey: "secret",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.6",
      timeoutMs: 5_000,
      maxOutputTokens: 4_000,
      fetchImpl,
    })

    await expect(
      provider.detect({
        sourceBlock: "<<<SOURCE>>>untrusted transcript<<<END>>>",
        promptVersion: "p1",
        schemaVersion: "s1",
        maxFindings: 10,
      }),
    ).resolves.toEqual(candidate())
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty("tools")
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    })
    expect(String(body.instructions)).toContain("untrusted data")
  })
})
