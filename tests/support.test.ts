import { describe, expect, it, vi } from "vitest"

import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
import { runValidatedStage } from "@/lib/ai/stage-runner"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"
import { prepareSupportCalls, validateSupportAssessments } from "@/lib/support/assessment"
import { supportAssessmentJsonSchema } from "@/lib/support/contracts"
import { OpenAISupportAssessmentProvider } from "@/lib/support/openai-provider"

const analysisId = "00000000-0000-4000-8000-000000000001"
const speakerId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const claimId = "00000000-0000-4000-8000-000000000004"
const segmentText = "The report cites a survey of 500 residents."

function claim(overrides: Partial<InternalClaimFinding> = {}): InternalClaimFinding {
  return {
    id: claimId,
    analysis_id: analysisId,
    kind: "claim",
    text: "The proposal has public support.",
    paraphrase: false,
    confidence: { raw: 0.8, signals: { source_low_confidence: false } },
    confidence_band: null,
    state: "ok",
    person_involved: false,
    span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 10 }],
    evidence_refs: [],
    produced_by_stage: "S2",
    claim: {
      claim_type: "factual",
      check_worthy: true,
      speaker_id: speakerId,
      speaker_label: "Speaker 1",
    },
    ...overrides,
  }
}

function prepared(options: { lowConfidence?: boolean; speaker?: string | null } = {}) {
  return prepareSupportCalls(
    {
      analysisId,
      status: "analyzing",
      claims: [claim()],
      segments: [
        {
          id: segmentId,
          index: 0,
          text: segmentText,
          speakerId: options.speaker === undefined ? speakerId : options.speaker,
          lowConfidence: options.lowConfidence ?? false,
        },
      ],
    },
    100_000,
    20,
  )
}

function candidate(overrides: Record<string, unknown> = {}): {
  assessments: Array<Record<string, unknown>>
} {
  const evidence = "cites a survey"
  const start = segmentText.indexOf(evidence)
  return {
    assessments: [
      {
        claim_id: claimId,
        state: "ok",
        support_level: "present",
        evidence_spans: [
          {
            segment_id: segmentId,
            start_char: start,
            end_char: start + evidence.length,
            text: evidence,
          },
        ],
        assessment_confidence: 0.82,
        reason_code: "explicit_support",
        ...overrides,
      },
    ],
  }
}

describe("F4 support preparation and grounding", () => {
  it("accepts exact same-speaker support spans with server-owned rationale", () => {
    const call = prepared().calls[0]
    expect(validateSupportAssessments(candidate(), call)[0]).toMatchObject({
      claimId,
      supportLevel: "present",
      state: "ok",
      reasonCode: "explicit_support",
      rationale: "The speaker provided explicit support for this claim in the transcript.",
    })
  })

  it("rejects unknown, duplicate, missing, and cross-speaker claim coverage", () => {
    const call = prepared().calls[0]
    expect(() => validateSupportAssessments({ assessments: [] }, call)).toThrow()
    expect(() =>
      validateSupportAssessments(
        candidate({ claim_id: "00000000-0000-4000-8000-000000000099" }),
        call,
      ),
    ).toThrow()
    expect(() =>
      validateSupportAssessments(
        { assessments: [candidate().assessments[0], candidate().assessments[0]] },
        { ...call, claims: [claim(), { ...claim(), id: "00000000-0000-4000-8000-000000000005" }] },
      ),
    ).toThrow()
    expect(() =>
      validateSupportAssessments(candidate(), {
        ...call,
        segments: call.segments.map((segment) => ({
          ...segment,
          speakerId: "00000000-0000-4000-8000-000000000099",
        })),
      }),
    ).toThrow()
  })

  it("preserves UTF-16 offsets when source delimiters collide with transcript text", () => {
    const collisionText = "Evidence <<<SOURCE>>> remains untrusted."
    const call = prepareSupportCalls(
      {
        analysisId,
        status: "analyzing",
        claims: [claim()],
        segments: [
          {
            id: segmentId,
            index: 0,
            text: collisionText,
            speakerId,
            lowConfidence: false,
          },
        ],
      },
      100_000,
      20,
    ).calls[0]
    const start = collisionText.indexOf("<<<SOURCE>>>")
    const escaped = escapeSourceDelimiters(collisionText).escapedSource
    const result = validateSupportAssessments(
      candidate({
        evidence_spans: [
          {
            segment_id: segmentId,
            start_char: start,
            end_char: start + "<<<SOURCE>>>".length,
            text: escaped.slice(start, start + "<<<SOURCE>>>".length),
          },
        ],
      }),
      call,
    )
    expect(result[0].spans[0]).toEqual({
      segment_id: segmentId,
      start_char: start,
      end_char: start + "<<<SOURCE>>>".length,
    })
  })

  it("uses deterministic insufficient results for unattributed, uncertain, or oversized context", () => {
    const unattributed = prepareSupportCalls(
      {
        analysisId,
        status: "analyzing",
        claims: [claim({ claim: { ...claim().claim, speaker_id: null, speaker_label: null } })],
        segments: [],
      },
      100_000,
      20,
    )
    expect(unattributed.calls).toHaveLength(0)
    expect(unattributed.deterministic[0]).toMatchObject({
      state: "insufficient",
      reasonCode: "speaker_unattributed",
      supportLevel: null,
    })

    const uncertainClaim = claim({
      confidence: { raw: 0.8, signals: { source_low_confidence: true } },
    })
    const uncertain = prepareSupportCalls(
      { analysisId, status: "analyzing", claims: [uncertainClaim], segments: [] },
      100_000,
      20,
    )
    expect(uncertain.deterministic[0].reasonCode).toBe("attribution_uncertain")
    expect(prepared().calls[0].source.length).toBeGreaterThan(0)
    expect(
      prepareSupportCalls(
        {
          analysisId,
          status: "analyzing",
          claims: [claim()],
          segments: [
            {
              id: segmentId,
              index: 0,
              text: segmentText,
              speakerId,
              lowConfidence: false,
            },
          ],
        },
        5,
        20,
      ).deterministic[0].reasonCode,
    ).toBe("context_incomplete")
  })

  it("downgrades absent to insufficient when transcript coverage is uncertain", () => {
    const call = prepared({ lowConfidence: true }).calls[0]
    const absent = candidate({
      support_level: "absent",
      evidence_spans: [],
      reason_code: "no_support_found",
    })
    expect(validateSupportAssessments(absent, call)[0]).toMatchObject({
      state: "insufficient",
      supportLevel: null,
      reasonCode: "context_incomplete",
    })
  })

  it("rejects extra structured fields and retries semantically invalid output", async () => {
    const call = prepared().calls[0]
    expect(() => validateSupportAssessments({ ...candidate(), unexpected: true }, call)).toThrow()
    const registry = new StageSchemaRegistry()
    registry.register("support", supportAssessmentJsonSchema)
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(candidate({ evidence_spans: [] }))
      .mockResolvedValueOnce(candidate())
    const result = await runValidatedStage({
      stage: "S3",
      schemaKey: "support",
      source: call.source,
      registry,
      invoke,
      transformValidated: (value) => validateSupportAssessments(value, call),
    })
    expect(result.attempts).toBe(2)
    expect(result.output[0].supportLevel).toBe("present")
  })
})

describe("F4 OpenAI structured-output adapter", () => {
  it("uses strict schema without tools and never enables storage", async () => {
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
    const provider = new OpenAISupportAssessmentProvider({
      apiKey: "secret",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.6",
      timeoutMs: 5_000,
      maxOutputTokens: 8_000,
      fetchImpl,
    })
    await expect(
      provider.assess({
        sourceBlock: "<<<SOURCE>>>data<<<END>>>",
        promptVersion: "p1",
        schemaVersion: "s1",
        maxClaims: 10,
      }),
    ).resolves.toEqual(candidate())
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty("tools")
    expect(body).toMatchObject({
      store: false,
      text: { format: { type: "json_schema", strict: true } },
    })
  })

  it("handles explicit refusal without inventing support", async () => {
    const provider = new OpenAISupportAssessmentProvider({
      apiKey: "secret",
      apiUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.6",
      timeoutMs: 5_000,
      maxOutputTokens: 8_000,
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              output: [{ type: "message", content: [{ type: "refusal", refusal: "declined" }] }],
            }),
            { status: 200 },
          ),
      ),
    })
    await expect(
      provider.assess({
        sourceBlock: "data",
        promptVersion: "p1",
        schemaVersion: "s1",
        maxClaims: 10,
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_PROVIDER_REFUSAL", retryable: false })
  })
})
