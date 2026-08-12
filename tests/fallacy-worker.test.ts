import { describe, expect, it, vi } from "vitest"

import type {
  InternalClaimFinding,
  InternalFallacyFinding,
  InternalStructureFinding,
} from "@/lib/contracts/analysis"
import { FallacyDetectionError } from "@/lib/fallacy/contracts"
import { FALLACY_TAXONOMY_VERSION } from "@/lib/fallacy/taxonomy"
import type { FallacyWorkerDependencies } from "@/lib/fallacy/worker"
import { processClaimedFallacyJob } from "@/lib/fallacy/worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const segmentId = "00000000-0000-4000-8000-000000000002"
const claimId = "00000000-0000-4000-8000-000000000003"
const structureId = "00000000-0000-4000-8000-000000000004"
const fallacyId = "00000000-0000-4000-8000-000000000005"
const segmentText = "Either we adopt this plan today, or the city will collapse."
const anchor = segmentText

const claim: InternalClaimFinding = {
  id: claimId,
  analysis_id: analysisId,
  kind: "claim",
  text: anchor,
  paraphrase: false,
  confidence: { raw: 0.94 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: anchor.length }],
  evidence_refs: [],
  produced_by_stage: "S2",
  claim: {
    claim_type: "policy",
    check_worthy: true,
    speaker_id: null,
    speaker_label: "Speaker 1",
  },
}

const structure: InternalStructureFinding = {
  id: structureId,
  analysis_id: analysisId,
  kind: "structure",
  text: anchor,
  paraphrase: false,
  confidence: { raw: 0.91 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: anchor.length }],
  evidence_refs: [],
  produced_by_stage: "S4",
  structure: {
    source_claim_id: claimId,
    role: "claim",
    inferred: false,
    anchor_role: "asserted_content",
  },
}

const persistedFinding: InternalFallacyFinding = {
  id: fallacyId,
  analysis_id: analysisId,
  kind: "fallacy",
  text: anchor,
  paraphrase: false,
  confidence_band: "high",
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: anchor.length }],
  evidence_refs: [],
  produced_by_stage: "S5",
  fallacy: {
    source_claim_id: claimId,
    possible_type: "Possible false dilemma",
    taxonomy_ref: `${FALLACY_TAXONOMY_VERSION}:LF_FALSE_DILEMMA`,
    why: "The wording may present only two options when other possibilities could exist.",
    caveat: null,
    contestable: true,
  },
}

const providerCandidate = {
  taxonomy_version: FALLACY_TAXONOMY_VERSION,
  findings: [
    {
      taxonomy_id: "LF_FALSE_DILEMMA",
      segment_id: segmentId,
      start_char: 0,
      end_char: anchor.length,
      text: anchor,
      framing: "possible",
      person_involved: false,
      confidence: 0.97,
    },
  ],
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S5" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000006",
  lockedAt: new Date(),
}

function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const detect = vi.fn(async () => providerCandidate)
  const dependencies = {
    providerFactory: vi.fn(() => ({ detect })),
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
      calls.push("fallacy.load")
      return {
        analysisId,
        status: "analyzing" as const,
        claims: [claim],
        structures: [structure],
        segments: [
          {
            id: segmentId,
            index: 0,
            text: segmentText,
            lowConfidence: false,
            personInvolved: false,
          },
        ],
      }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("fallacy.snapshot")
      return undefined
    }),
    persist: vi.fn(async (_analysisId, _stageRunId, findings) => {
      calls.push(`fallacy.persist.${findings.length}`)
      return { created: true, findings: findings.length === 0 ? [] : [persistedFinding] }
    }),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S5" as const,
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
    evidenceRetrievalEnabled: false,
    now: () => new Date("2030-01-01T00:00:00Z"),
  } as unknown as FallacyWorkerDependencies
  return { calls, dependencies, detect, events }
}

describe("F17/S5 fallacy worker orchestration", () => {
  it("persists an exact-span finding and hands completed S5 output to S8", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedFallacyJob(job, dependencies)

    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      "stage-id",
      [expect.objectContaining({ sourceClaimId: claimId, personInvolved: false })],
      expect.any(Object),
    )
    expect(calls.indexOf("job.renew")).toBeLessThan(calls.indexOf("fallacy.persist.1"))
    expect(calls.filter((call) => call === "job.renew")).toHaveLength(2)
    expect(calls).not.toContain("stage.complete")
    expect(calls.at(-1)).toBe("job.advance.S8")
    expect(events).toContainEqual(
      expect.objectContaining({ type: "stage.status", stage: "S5", status: "complete" }),
    )
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({ stage: "S5", findings: [expect.any(Object)] })
    expect(JSON.stringify(batch)).not.toContain('"confidence"')
    expect(JSON.stringify(batch)).not.toContain("0.97")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("atomically completes and publishes an honest empty output", async () => {
    const { dependencies, detect, events } = fixture()
    detect.mockResolvedValueOnce({ taxonomy_version: FALLACY_TAXONOMY_VERSION, findings: [] })
    await processClaimedFallacyJob(job, dependencies)

    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      "stage-id",
      [],
      expect.any(Object),
    )
    expect(events).toContainEqual({ type: "finding.batch", stage: "S5", findings: [] })
    expect(events).toContainEqual(
      expect.objectContaining({ type: "stage.status", stage: "S5", status: "complete" }),
    )
  })

  it("replays a completed S5 snapshot without a provider call", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.getSnapshot).mockImplementationOnce(async () => {
      calls.push("fallacy.snapshot")
      return { status: "complete", attempt: 1, findings: [persistedFinding] }
    })
    await processClaimedFallacyJob(job, dependencies)

    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ type: "finding.batch", stage: "S5" }))
    expect(calls.at(-1)).toBe("job.advance.S8")
  })

  it("retries a transient provider failure without publishing completion", async () => {
    const { calls, dependencies, detect, events } = fixture()
    detect.mockRejectedValueOnce(
      new FallacyDetectionError("FALLACY_PROVIDER_UNAVAILABLE", "temporary", true),
    )
    await processClaimedFallacyJob(job, dependencies)

    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(
      events.some((event) => event.type === "stage.status" && event.status === "complete"),
    ).toBe(false)
  })

  it("isolates a terminal S5 failure and advances valid input to S6", async () => {
    const { calls, dependencies, detect, events } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    detect.mockRejectedValueOnce(
      new FallacyDetectionError("FALLACY_PROVIDER_REFUSAL", "declined", false),
    )
    await processClaimedFallacyJob({ ...job, attempts: 3 }, dependencies)

    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.fail")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "FALLACY_PROVIDER_REFUSAL" }),
    )
  })

  it("emits no completion after lease loss following the atomic commit", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.renewJob)
      .mockImplementationOnce(async () => {
        calls.push("job.renew")
        return true
      })
      .mockImplementationOnce(async () => {
        calls.push("job.renew")
        return false
      })
    await processClaimedFallacyJob(job, dependencies)

    expect(dependencies.persist).toHaveBeenCalled()
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
    expect(
      events.some((event) => event.type === "stage.status" && event.status === "complete"),
    ).toBe(false)
  })
})
