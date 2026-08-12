import { describe, expect, it, vi } from "vitest"

import type { EvidenceSource, InternalClaimFinding } from "@/lib/contracts/analysis"
import { EvidenceError } from "@/lib/evidence/contracts"
import type { EvidenceWorkerDependencies } from "@/lib/evidence/worker"
import { processClaimedEvidenceJob } from "@/lib/evidence/worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const claimId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const sourceId = "00000000-0000-4000-8000-000000000004"
const claimText = "The city budget increased."
const sourceText = "The official report says the city budget increased."

const internalClaim: InternalClaimFinding = {
  id: claimId,
  analysis_id: analysisId,
  kind: "claim",
  text: claimText,
  paraphrase: false,
  confidence: { raw: 0.81 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: claimText.length }],
  evidence_refs: [],
  produced_by_stage: "S2",
  claim: {
    claim_type: "factual",
    check_worthy: true,
    speaker_id: null,
    speaker_label: null,
  },
}

const persistedSource: EvidenceSource = {
  id: sourceId,
  analysis_id: analysisId,
  url: "https://data.example/report",
  retrieved_snippet: sourceText,
  provenance: "Official report",
  tier: "T1",
  resolves: true,
  supports_relation: "supports",
  licensing_quote_verified: true,
  retrieved_at: "2030-01-01T00:00:00.000Z",
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S6" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000005",
  lockedAt: new Date(),
}

function fixture(claims: InternalClaimFinding[] = [internalClaim]) {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  let persisted: EvidenceSource[] = []
  const dependencies = {
    retrieverFactory: vi.fn(() => ({
      retrieve: vi.fn(async () => ({
        candidates: [
          {
            url: "https://data.example/report",
            passage: sourceText,
            provenance: "Official report",
            tier: "T1",
            retrieved_at: "2030-01-01T00:00:00.000Z",
          },
        ],
      })),
    })),
    verifierFactory: vi.fn(() => ({
      verify: vi.fn(async () => ({
        relation: "supports",
        licensing_quote: sourceText,
        confidence: 0.9,
      })),
    })),
    sourceResolver: {
      resolve: vi.fn(async (candidate) => ({
        ...candidate,
        finalUrl: candidate.url,
        sourceText,
      })),
    },
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
      calls.push("evidence.load")
      return {
        analysisId,
        status: "analyzing" as const,
        claims,
        validSegmentIds: new Set([segmentId]),
      }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("evidence.snapshot")
      return undefined
    }),
    getRefs: vi.fn(async () =>
      persisted.length > 0 ? new Map([[claimId, [sourceId]]]) : new Map(),
    ),
    persist: vi.fn(async (_id, evidence) => {
      calls.push("evidence.persist")
      persisted = evidence.length > 0 ? [persistedSource] : []
      return { created: true, sources: persisted }
    }),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S6" as const,
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
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  } as unknown as EvidenceWorkerDependencies
  return { calls, dependencies, events }
}

describe("F6 worker orchestration", () => {
  it("hands completed S6 to independently enabled S7 without ending partial", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.sourceCredibilityEnabled = true
    dependencies.advanceJob = vi.fn(async (_id, _token, _expected, next) => {
      calls.push(`job.advance.${next}`)
      return true
    })

    await processClaimedEvidenceJob(job, dependencies)

    expect(calls).toContain("job.advance.S7")
    expect(calls).not.toContain("analysis.partial")
    expect(events).not.toContainEqual({ type: "analysis.done", status: "partial" })
  })

  it("completes an empty eligible set and advances to S8 without provider calls", async () => {
    const ineligible = {
      ...internalClaim,
      claim: { ...internalClaim.claim, claim_type: "policy" as const, check_worthy: false },
    }
    const { calls, dependencies, events } = fixture([ineligible])
    await processClaimedEvidenceJob(job, dependencies)
    expect(dependencies.retrieverFactory).not.toHaveBeenCalled()
    expect(dependencies.verifierFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      [],
      expect.any(Object),
      "stage-id",
    )
    expect(events).toContainEqual({ type: "finding.batch", stage: "S6", findings: [] })
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(calls).toContain("job.advance.S8")
  })

  it("persists verified evidence and publishes only traceable public references", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedEvidenceJob(job, dependencies)
    const persisted = vi.mocked(dependencies.persist).mock.calls[0]?.[1]
    expect(persisted).toEqual([
      expect.objectContaining({
        claimId,
        relation: "supports",
        snippet: sourceText,
        verificationConfidence: 0.9,
      }),
    ])
    expect(calls.indexOf("evidence.persist")).toBeLessThan(calls.lastIndexOf("event.stage.status"))
    expect(calls.lastIndexOf("event.stage.status")).toBeLessThan(
      calls.indexOf("event.finding.batch"),
    )
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({
      stage: "S6",
      findings: [expect.objectContaining({ id: claimId, evidence_refs: [sourceId] })],
    })
    expect(JSON.stringify(batch)).not.toContain('"confidence":')
    expect(JSON.stringify(batch)).not.toMatch(/truth|liar|credibility/i)
  })

  it("publishes an honest empty result when verification is insufficient", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.verifierFactory).mockReturnValueOnce({
      verify: vi.fn(async () => ({
        relation: "insufficient",
        licensing_quote: null,
        confidence: 0.2,
      })),
    })
    await processClaimedEvidenceJob(job, dependencies)
    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      [],
      expect.any(Object),
      "stage-id",
    )
    expect(events).toContainEqual({ type: "finding.batch", stage: "S6", findings: [] })
  })

  it("replays a completed empty result without repeating provider calls", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.getSnapshot).mockResolvedValueOnce({
      status: "complete",
      attempt: 1,
      sources: [],
    })
    await processClaimedEvidenceJob(job, dependencies)
    expect(dependencies.retrieverFactory).not.toHaveBeenCalled()
    expect(dependencies.verifierFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events).toContainEqual({ type: "finding.batch", stage: "S6", findings: [] })
  })

  it("replays a completed stage without calling providers or persistence", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.getSnapshot).mockResolvedValueOnce({
      status: "complete",
      attempt: 1,
      sources: [persistedSource],
    })
    vi.mocked(dependencies.getRefs).mockResolvedValueOnce(new Map([[claimId, [sourceId]]]))
    await processClaimedEvidenceJob(job, dependencies)
    expect(dependencies.retrieverFactory).not.toHaveBeenCalled()
    expect(dependencies.verifierFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events.find((event) => event.type === "finding.batch")).toMatchObject({
      stage: "S6",
      findings: [expect.objectContaining({ evidence_refs: [sourceId] })],
    })
  })

  it("retries when all candidates fail transiently", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.sourceResolver.resolve).mockRejectedValueOnce(
      new EvidenceError("EVIDENCE_SOURCE_TIMEOUT", "temporary", true),
    )
    await processClaimedEvidenceJob(job, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("preserves prior stages and advances terminal S6 failure to partial assembly", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.retrieverFactory).mockReturnValueOnce({
      retrieve: vi.fn(async () => {
        throw new EvidenceError("EVIDENCE_RETRIEVER_REQUEST_REJECTED", "rejected", false)
      }),
    })
    await processClaimedEvidenceJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.advance.S8")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.fail")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("publishes no completion after lease loss", async () => {
    const { calls, dependencies, events } = fixture([])
    vi.mocked(dependencies.renewJob).mockImplementationOnce(async () => {
      calls.push("job.renew")
      return false
    })
    await processClaimedEvidenceJob(job, dependencies)
    expect(calls).not.toContain("stage.complete")
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
    expect(
      events.some((event) => event.type === "stage.status" && event.status === "complete"),
    ).toBe(false)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })
})
