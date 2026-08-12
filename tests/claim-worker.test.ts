import { describe, expect, it, vi } from "vitest"

import type { ClaimWorkerDependencies } from "@/lib/claims/worker"
import { processClaimedClaimJob } from "@/lib/claims/worker"
import { ClaimExtractionError } from "@/lib/claims/contracts"

const segmentId = "00000000-0000-4000-8000-000000000001"
const analysisId = "00000000-0000-4000-8000-000000000002"
const findingId = "00000000-0000-4000-8000-000000000003"
const text = "The city budget increased."
const internalFinding = {
  id: findingId,
  analysis_id: analysisId,
  kind: "claim" as const,
  text,
  paraphrase: false,
  confidence: { raw: 0.8 },
  confidence_band: null,
  state: "ok" as const,
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: text.length }],
  evidence_refs: [],
  produced_by_stage: "S2" as const,
  claim: {
    claim_type: "factual" as const,
    check_worthy: true,
    speaker_id: null,
    speaker_label: null,
  },
}

function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    providerFactory: vi.fn(() => ({
      extract: vi.fn(async () => ({
        claims: [
          {
            segment_id: segmentId,
            start_char: 0,
            end_char: text.length,
            text,
            paraphrase: false,
            claim_type: "factual",
            check_worthy: true,
            extraction_confidence: 0.8,
          },
        ],
      })),
    })),
    renewJob: vi.fn(async () => true),
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

    loadTranscript: vi.fn(async () => {
      calls.push("transcript.load")
      return {
        analysisId,
        transcriptId: "00000000-0000-4000-8000-000000000004",
        segments: [
          {
            id: segmentId,
            index: 0,
            text,
            speakerId: null,
            speakerLabel: null,
            speakerIsNamedPerson: false,
            lowConfidence: false,
          },
        ],
      }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("claims.snapshot")
      return undefined
    }),
    persist: vi.fn(async () => {
      calls.push("claims.persist")
      return { created: true, findings: [internalFinding] }
    }),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S2" as const,
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
    supportAssessmentEnabled: false,
    evidenceRetrievalEnabled: false,
    now: () => new Date("2030-01-01T00:00:00Z"),
  } as unknown as ClaimWorkerDependencies
  return { calls, dependencies, events }
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S2" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000005",
  lockedAt: new Date(),
}

describe("F3 worker orchestration", () => {
  it("persists and emits traceable S2 claims without completing the analysis", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toEqual([
      "transcript.load",
      "claims.snapshot",
      "stage.supersede",
      "stage.create",
      "stage.running",
      "event.stage.status",
      "claims.persist",
      "stage.complete",
      "event.stage.status",
      "event.finding.batch",
      "job.advance.S8",
    ])
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({ stage: "S2" })
    expect(JSON.stringify(batch)).not.toContain('confidence"')
    expect(calls.some((call) => call === "analysis.complete")).toBe(false)
  })

  it("replays completed persisted claims without invoking the provider", async () => {
    const { calls, dependencies } = fixture()
    vi.mocked(dependencies.getSnapshot).mockImplementationOnce(async () => {
      calls.push("claims.snapshot")
      return { status: "complete", attempt: 1, findings: [internalFinding] }
    })
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toEqual([
      "transcript.load",
      "claims.snapshot",
      "event.finding.batch",
      "job.advance.S8",
    ])
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
  })

  it("advances completed S2 work to S3 when support assessment is enabled", async () => {
    const { calls, dependencies } = fixture()
    dependencies.supportAssessmentEnabled = true
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toContain("job.advance.S3")
    expect(calls).not.toContain("job.complete")
    expect(dependencies.advanceJob).toHaveBeenCalledWith(job.id, job.lockToken, "S2", "S3")
  })

  it("advances replayed S2 work to S3 without invoking the provider", async () => {
    const { calls, dependencies } = fixture()
    dependencies.supportAssessmentEnabled = true
    vi.mocked(dependencies.getSnapshot).mockImplementationOnce(async () => {
      calls.push("claims.snapshot")
      return { status: "complete", attempt: 1, findings: [internalFinding] }
    })
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toEqual([
      "transcript.load",
      "claims.snapshot",
      "event.finding.batch",
      "job.advance.S3",
    ])
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
  })

  it("advances completed S2 work directly to S6 when F4 is disabled", async () => {
    const { calls, dependencies } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("job.complete")
    expect(dependencies.advanceJob).toHaveBeenCalledWith(job.id, job.lockToken, "S2", "S6")
  })

  it("retries transient provider failures without failing the analysis", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      extract: vi.fn(async () => {
        throw new ClaimExtractionError("CLAIM_PROVIDER_UNAVAILABLE", "temporary", true)
      }),
    })
    await processClaimedClaimJob(job, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(calls).not.toContain("analysis.failed")
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "CLAIM_PROVIDER_UNAVAILABLE" }),
    )
  })

  it("fails honestly after a terminal input error", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.loadTranscript).mockImplementationOnce(async () => {
      calls.push("transcript.load")
      throw new ClaimExtractionError("CLAIM_INPUT_EMPTY", "empty", false)
    })
    await processClaimedClaimJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("analysis.failed")
    expect(calls).toContain("job.fail")
    expect(calls).not.toContain("job.retry")
    expect(events).toContainEqual({ type: "analysis.done", status: "failed" })
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
  })
})
