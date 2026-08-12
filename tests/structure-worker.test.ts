import { describe, expect, it, vi } from "vitest"

import type {
  InternalClaimFinding,
  InternalStructureFinding,
  InternalSupportFinding,
  StructureEdge,
} from "@/lib/contracts/analysis"
import { StructureMappingError } from "@/lib/structure/contracts"
import type { StructureWorkerDependencies } from "@/lib/structure/worker"
import { processClaimedStructureJob } from "@/lib/structure/worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const speakerId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const claimId = "00000000-0000-4000-8000-000000000004"
const supportId = "00000000-0000-4000-8000-000000000005"
const rootId = "00000000-0000-4000-8000-000000000006"
const dataId = "00000000-0000-4000-8000-000000000007"
const edgeId = "00000000-0000-4000-8000-000000000008"
const claimText = "The city should expand transit."
const dataText = "A survey supports the plan."
const segmentText = `${claimText} ${dataText}`
const dataStart = segmentText.indexOf(dataText)

const claim: InternalClaimFinding = {
  id: claimId,
  analysis_id: analysisId,
  kind: "claim",
  text: claimText,
  paraphrase: false,
  confidence: { raw: 0.8, signals: { source_low_confidence: false } },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: claimText.length }],
  evidence_refs: [],
  produced_by_stage: "S2",
  claim: {
    claim_type: "policy",
    check_worthy: false,
    speaker_id: speakerId,
    speaker_label: "Speaker 1",
  },
}

const support: InternalSupportFinding = {
  id: supportId,
  analysis_id: analysisId,
  kind: "support",
  text: "The speaker provided explicit support for this claim in the transcript.",
  paraphrase: false,
  confidence: { raw: 0.8 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [
    { segment_id: segmentId, start_char: dataStart, end_char: dataStart + dataText.length },
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

const internalFindings: InternalStructureFinding[] = [
  {
    id: rootId,
    analysis_id: analysisId,
    kind: "structure",
    text: claimText,
    paraphrase: false,
    confidence: { raw: 0.9 },
    confidence_band: null,
    state: "ok",
    person_involved: false,
    span_refs: claim.span_refs,
    evidence_refs: [],
    produced_by_stage: "S4",
    structure: {
      source_claim_id: claimId,
      role: "claim",
      inferred: false,
      anchor_role: "asserted_content",
    },
  },
  {
    id: dataId,
    analysis_id: analysisId,
    kind: "structure",
    text: dataText,
    paraphrase: false,
    confidence: { raw: 0.8 },
    confidence_band: null,
    state: "ok",
    person_involved: false,
    span_refs: support.span_refs,
    evidence_refs: [],
    produced_by_stage: "S4",
    structure: {
      source_claim_id: claimId,
      role: "data",
      inferred: false,
      anchor_role: "asserted_content",
    },
  },
]
const internalEdges: StructureEdge[] = [
  {
    id: edgeId,
    analysis_id: analysisId,
    from_finding_id: dataId,
    to_finding_id: rootId,
    relation: "supports",
  },
]

function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    providerFactory: vi.fn(() => ({
      map: vi.fn(async () => ({
        graphs: [
          {
            claim_id: claimId,
            state: "ok",
            reason_code: "mapped",
            nodes: [
              {
                node_id: "claim-root",
                role: "claim",
                inferred: false,
                text: claimText,
                anchor_span: {
                  segment_id: segmentId,
                  start_char: 0,
                  end_char: claimText.length,
                  text: claimText,
                },
                confidence: 0.9,
              },
              {
                node_id: "data-1",
                role: "data",
                inferred: false,
                text: dataText,
                anchor_span: {
                  segment_id: segmentId,
                  start_char: dataStart,
                  end_char: dataStart + dataText.length,
                  text: dataText,
                },
                confidence: 0.8,
              },
            ],
            edges: [{ from_node_id: "data-1", to_node_id: "claim-root", relation: "supports" }],
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
      calls.push("structure.load")
      return {
        analysisId,
        status: "analyzing" as const,
        claims: [claim],
        supports: [support],
        segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
      }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("structure.snapshot")
      return undefined
    }),
    persist: vi.fn(async () => {
      calls.push("structure.persist")
      return { created: true, findings: internalFindings, edges: internalEdges }
    }),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S4" as const,
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
  } as unknown as StructureWorkerDependencies
  return { calls, dependencies, events }
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S4" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000009",
  lockedAt: new Date(),
}

describe("F5 worker orchestration", () => {
  it("hands completed S4 to independently enabled S5 before S6", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.fallacyDetectionEnabled = true
    dependencies.evidenceRetrievalEnabled = true

    await processClaimedStructureJob(job, dependencies)

    expect(calls).toContain("job.advance.S5")
    expect(calls).not.toContain("job.advance.S6")
    expect(events).not.toContainEqual({ type: "analysis.done", status: "partial" })
  })

  it("publishes traceable nodes and edges before handing S4 to S8", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedStructureJob(job, dependencies)
    expect(calls.indexOf("job.renew")).toBeLessThan(calls.indexOf("stage.complete"))
    expect(calls.at(-1)).toBe("job.advance.S8")
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({ stage: "S4", structure_edges: internalEdges })
    expect(JSON.stringify(batch)).not.toContain('"confidence"')
    expect(JSON.stringify(batch)).not.toMatch(/winner|credibility|truth_verdict/i)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("replays completed graphs without invoking the provider", async () => {
    const { calls, dependencies } = fixture()
    vi.mocked(dependencies.getSnapshot).mockImplementationOnce(async () => {
      calls.push("structure.snapshot")
      return { status: "complete", attempt: 1, findings: internalFindings, edges: internalEdges }
    })
    await processClaimedStructureJob(job, dependencies)
    expect(calls).toEqual([
      "structure.load",
      "structure.snapshot",
      "job.renew",
      "event.finding.batch",
      "job.advance.S8",
    ])
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
  })

  it("advances completed S4 work to independent S6", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    await processClaimedStructureJob(job, dependencies)
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(dependencies.advanceJob).toHaveBeenCalledWith(job.id, job.lockToken, "S4", "S6")
  })

  it("reactivates a legacy partial analysis before mapping", async () => {
    const { calls, dependencies } = fixture()
    vi.mocked(dependencies.loadInput).mockResolvedValueOnce({
      analysisId,
      status: "partial",
      claims: [claim],
      supports: [support],
      segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
    })
    await processClaimedStructureJob(job, dependencies)
    expect(calls.indexOf("analysis.analyzing")).toBeLessThan(calls.indexOf("structure.snapshot"))
    expect(calls).toContain("job.advance.S8")
    expect(calls).not.toContain("analysis.partial")
  })

  it("completes an empty claim set without invoking the provider", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.loadInput).mockResolvedValueOnce({
      analysisId,
      status: "analyzing",
      claims: [],
      supports: [],
      segments: [{ id: segmentId, index: 0, text: segmentText, speakerId, lowConfidence: false }],
    })
    vi.mocked(dependencies.persist).mockResolvedValueOnce({
      created: true,
      findings: [],
      edges: [],
    })
    await processClaimedStructureJob(job, dependencies)
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(events).toContainEqual({
      type: "finding.batch",
      stage: "S4",
      findings: [],
      structure_edges: [],
    })
  })

  it("retries transient provider failures without ending partial", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      map: vi.fn(async () => {
        throw new StructureMappingError("STRUCTURE_PROVIDER_UNAVAILABLE", "temporary", true)
      }),
    })
    await processClaimedStructureJob(job, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(calls).not.toContain("analysis.partial")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("preserves earlier findings and ends partial after terminal refusal", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      map: vi.fn(async () => {
        throw new StructureMappingError("STRUCTURE_PROVIDER_REFUSAL", "declined", false)
      }),
    })
    await processClaimedStructureJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("analysis.partial")
    expect(calls).toContain("job.fail")
    expect(events.findIndex((event) => event.type === "error")).toBeLessThan(
      events.findIndex((event) => event.type === "analysis.done"),
    )
  })

  it("isolates a terminal S4 failure and continues independent S6", async () => {
    const { calls, dependencies, events } = fixture()
    dependencies.evidenceRetrievalEnabled = true
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      map: vi.fn(async () => {
        throw new StructureMappingError("STRUCTURE_PROVIDER_REFUSAL", "declined", false)
      }),
    })
    await processClaimedStructureJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.advance.S6")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.fail")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("publishes no completion after lease loss", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.renewJob).mockImplementationOnce(async () => {
      calls.push("job.renew")
      return false
    })
    await processClaimedStructureJob(job, dependencies)
    expect(calls).not.toContain("stage.complete")
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })
})
