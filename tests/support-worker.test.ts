import { describe, expect, it, vi } from "vitest"

import type { InternalClaimFinding, InternalSupportFinding } from "@/lib/contracts/analysis"
import { SupportAssessmentError } from "@/lib/support/contracts"
import type { SupportWorkerDependencies } from "@/lib/support/worker"
import { processClaimedSupportJob } from "@/lib/support/worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const speakerId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const claimId = "00000000-0000-4000-8000-000000000004"
const supportId = "00000000-0000-4000-8000-000000000005"
const segmentText = "The report cites a survey of 500 residents."
const evidenceText = "cites a survey"
const evidenceStart = segmentText.indexOf(evidenceText)

const internalClaim: InternalClaimFinding = {
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
}

const internalSupport: InternalSupportFinding = {
  id: supportId,
  analysis_id: analysisId,
  kind: "support",
  text: "The speaker provided explicit support for this claim in the transcript.",
  paraphrase: false,
  confidence: { raw: 0.82 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [
    {
      segment_id: segmentId,
      start_char: evidenceStart,
      end_char: evidenceStart + evidenceText.length,
    },
  ],
  evidence_refs: [],
  produced_by_stage: "S3",
  support: {
    claim_id: claimId,
    support_level: "present",
    rationale: "The speaker provided explicit support for this claim in the transcript.",
    reason_code: "explicit_support",
    anchor_role: "support_evidence",
  },
}

function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    providerFactory: vi.fn(() => ({
      assess: vi.fn(async () => ({
        assessments: [
          {
            claim_id: claimId,
            state: "ok",
            support_level: "present",
            evidence_spans: [
              {
                segment_id: segmentId,
                start_char: evidenceStart,
                end_char: evidenceStart + evidenceText.length,
                text: evidenceText,
              },
            ],
            assessment_confidence: 0.82,
            reason_code: "explicit_support",
          },
        ],
      })),
    })),
    renewJob: vi.fn(async () => {
      calls.push("job.renew")
      return true
    }),
    advanceJob: vi.fn(async (_id, _token, _expected, next) => {
      calls.push(`job.advance.${next}`)
      return true
    }),
    completeJob: vi.fn(async () => {
      calls.push("job.complete")
      return true
    }),
    retryJob: vi.fn(async () => {
      calls.push("job.retry")
      return true
    }),
    failJob: vi.fn(async () => {
      calls.push("job.fail")
      return true
    }),
    loadInput: vi.fn(async () => {
      calls.push("support.load")
      return {
        analysisId,
        status: "analyzing" as const,
        claims: [internalClaim],
        segments: [
          {
            id: segmentId,
            index: 0,
            text: segmentText,
            speakerId,
            lowConfidence: false,
          },
        ],
      }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("support.snapshot")
      return undefined
    }),
    persist: vi.fn(async () => {
      calls.push("support.persist")
      return { created: true, findings: [internalSupport] }
    }),

    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S3" as const,
        status: "pending" as const,
        attempt: 1,
        startedAt: null,
        finishedAt: null,
        errorClass: null,
        createdAt: new Date(),
      }
    }),
    transitionStage: vi.fn(async (_id, _expected, next) => {
      calls.push(`stage.${next}`)
      return {} as never
    }),
    transitionAnalysis: vi.fn(async (_id, _expected, next) => {
      calls.push(`analysis.${next}`)
      return {} as never
    }),
    appendEvent: vi.fn(async (_id, event) => {
      calls.push(`event.${event.type}`)
      events.push(event)
      return { sequence: BigInt(events.length), event }
    }),
    recordInjection: vi.fn(async () => {
      calls.push("injection.record")
    }),
    argumentStructureEnabled: false,
    evidenceRetrievalEnabled: false,
    now: () => new Date("2030-01-01T00:00:00Z"),
  } as unknown as SupportWorkerDependencies
  return { calls, dependencies, events }
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S3" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000006",
  lockedAt: new Date(),
}

describe("F4 worker orchestration", () => {
  it("persists, publishes, and hands the completed F4 result to S8", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedSupportJob(job, dependencies)
    expect(calls.indexOf("job.renew")).toBeLessThan(calls.indexOf("stage.complete"))
    expect(calls.at(-1)).toBe("job.advance.S8")
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({ stage: "S3" })
    expect(JSON.stringify(batch)).not.toContain('"confidence"')
    expect(JSON.stringify(batch)).not.toMatch(/truth|verdict|credibility/i)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("advances completed S3 work to S4 without ending the analysis", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.argumentStructureEnabled = true
    await processClaimedSupportJob(job, dependencies)
    expect(calls).toContain("job.advance.S4")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(dependencies.advanceJob).toHaveBeenCalledWith(job.id, job.lockToken, "S3", "S4")
  })

  it("advances completed S3 work directly to independent S6 when F5 is disabled", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    await processClaimedSupportJob(job, dependencies)
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("analysis.partial")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(dependencies.advanceJob).toHaveBeenCalledWith(job.id, job.lockToken, "S3", "S6")
  })

  it("replays completed support without invoking the provider", async () => {
    const { calls, dependencies } = fixture()
    vi.mocked(dependencies.getSnapshot).mockImplementationOnce(async () => {
      calls.push("support.snapshot")
      return { status: "complete", attempt: 1, findings: [internalSupport] }
    })
    await processClaimedSupportJob(job, dependencies)
    expect(calls).toEqual([
      "support.load",
      "support.snapshot",
      "job.renew",
      "event.finding.batch",
      "job.advance.S8",
    ])
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
  })

  it("completes an empty claim set without invoking the provider", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.loadInput).mockResolvedValueOnce({
      analysisId,
      status: "analyzing",
      claims: [],
      segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
    })
    vi.mocked(dependencies.persist).mockResolvedValueOnce({ created: true, findings: [] })
    await processClaimedSupportJob(job, dependencies)
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).toHaveBeenCalledWith(analysisId, [], expect.any(Object))
    expect(events).toContainEqual({ type: "finding.batch", stage: "S3", findings: [] })
  })

  it("retries transient failures without publishing partial completion", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => {
        throw new SupportAssessmentError("SUPPORT_PROVIDER_UNAVAILABLE", "temporary", true)
      }),
    })
    await processClaimedSupportJob(job, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(calls).not.toContain("analysis.partial")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("preserves claims and ends partial after a terminal provider refusal", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => {
        throw new SupportAssessmentError("SUPPORT_PROVIDER_REFUSAL", "declined", false)
      }),
    })
    await processClaimedSupportJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("analysis.partial")
    expect(calls).toContain("job.fail")
    expect(events.findIndex((event) => event.type === "error")).toBeLessThan(
      events.findIndex((event) => event.type === "analysis.done"),
    )
    expect(events).toContainEqual({ type: "analysis.done", status: "partial" })
  })

  it("isolates a terminal S3 failure and continues independent S6", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => {
        throw new SupportAssessmentError("SUPPORT_PROVIDER_REFUSAL", "declined", false)
      }),
    })
    await processClaimedSupportJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.fail")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("does not mask a terminal input failure with an invalid status transition", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.loadInput).mockImplementationOnce(async () => {
      calls.push("support.load")
      throw new SupportAssessmentError("SUPPORT_INPUT_NOT_READY", "not ready", false)
    })
    await processClaimedSupportJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("job.fail")
    expect(calls).not.toContain("analysis.partial")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "SUPPORT_INPUT_NOT_READY" }),
    )
  })

  it("emits no completion after losing the lease before publication", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.renewJob).mockImplementationOnce(async () => {
      calls.push("job.renew")
      return false
    })
    await processClaimedSupportJob(job, dependencies)
    expect(calls).not.toContain("stage.complete")
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })
})
