import { describe, expect, it, vi } from "vitest"

import type { AssembledAnalysis } from "@/lib/contracts/analysis"
import {
  processClaimedFinalizationJob,
  type FinalizationWorkerDependencies,
} from "@/lib/analysis/finalization-worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const findingId = "00000000-0000-4000-8000-000000000002"
const segmentId = "00000000-0000-4000-8000-000000000003"
const assembled: AssembledAnalysis = {
  overview: {
    categorical_read: "transcript_anchored",
    distribution: {
      claims: 1,
      support_present: 0,
      support_weak: 0,
      support_absent: 0,
      support_insufficient: 0,
      verified_sources: 0,
      possible_patterns: 0,
    },
    top_insight:
      "1 transcript-grounded claim(s) and 0 verified external source(s) are available for review.",
    explore_pointers: [{ finding_id: findingId, reason: "claim_context" }],
  },
  findings: [
    {
      id: findingId,
      analysis_id: analysisId,
      kind: "claim",
      text: "Anchored claim",
      paraphrase: false,
      confidence_band: "insufficient",
      state: "ok",
      person_involved: false,
      span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 5 }],
      evidence_refs: [],
      produced_by_stage: "S2",
    },
  ],
  sources: [],
  structure_edges: [],
  stage_runs: [],
}
function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    renewJob: vi.fn(async () => true),
    advanceJob: vi.fn(async (_id, _token, _expected, next) => {
      calls.push(`advance.${next}`)
      return true
    }),
    completeJob: vi.fn(async () => {
      calls.push("job.complete")
      return true
    }),
    retryJob: vi.fn(async () => true),
    failJob: vi.fn(async () => true),
    getAnalysis: vi.fn(async () => ({ status: "analyzing" as const })),
    getStage: vi.fn(async () => undefined),
    getRuns: vi.fn(async () => [
      { stage: "S7" as const, status: "complete" as const, attempt: 1, error_class: null },
    ]),
    assemble: vi.fn(async () => assembled),
    failRunningAttempts: vi.fn(async () => undefined),
    createAttempt: vi.fn(async (_id, stage) => ({
      id: "run-id",
      analysisId,
      stage,
      status: "pending" as const,
      attempt: 1,
      startedAt: null,
      finishedAt: null,
      errorClass: null,
      createdAt: new Date(),
    })),
    transitionStage: vi.fn(async (_id, _expected, next) => {
      calls.push(`stage.${next}`)
      return {} as never
    }),
    transitionAnalysis: vi.fn(async (_id, _expected, next) => {
      calls.push(`analysis.${next}`)
      return {} as never
    }),
    appendEvent: vi.fn(async (_id, event) => {
      events.push(event)
      return { sequence: BigInt(events.length), event }
    }),
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  } as unknown as FinalizationWorkerDependencies
  return { calls, dependencies, events }
}
const job = (stage: "S8" | "S9" | "S10", attempts = 1) => ({
  id: "job-id",
  analysisId,
  stage,
  attempts,
  lockToken: "00000000-0000-4000-8000-000000000004",
  lockedAt: new Date(),
})

describe("S8-S10 durable finalization", () => {
  it("runs deterministic S8 and advances the same durable job to S9", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedFinalizationJob(job("S8"), dependencies)

    expect(dependencies.assemble).toHaveBeenCalledWith(analysisId)
    expect(calls).toContain("stage.complete")
    expect(calls).toContain("advance.S9")
    expect(events.some((event) => event.type === "overview.ready")).toBe(false)
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
  })

  it("emits only assembled S10 output and derives partial from an upstream failure", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.getRuns)
      .mockResolvedValueOnce([{ stage: "S9", status: "complete", attempt: 1, error_class: null }])
      .mockResolvedValueOnce([
        { stage: "S7", status: "failed", attempt: 1, error_class: "UNAVAILABLE" },
        { stage: "S9", status: "complete", attempt: 1, error_class: null },
        { stage: "S10", status: "complete", attempt: 1, error_class: null },
      ])
    await processClaimedFinalizationJob(job("S10"), dependencies)

    expect(events).toContainEqual({ type: "overview.ready", overview: assembled.overview })
    expect(events).toContainEqual({
      type: "finding.batch",
      stage: "S10",
      findings: assembled.findings,
      structure_edges: [],
    })
    expect(events).toContainEqual({ type: "analysis.done", status: "partial" })
    expect(calls).toContain("analysis.partial")
    expect(calls.at(-1)).toBe("job.complete")
  })
  it("retries a failed finalization attempt without emitting public output", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.assemble).mockRejectedValueOnce(new Error("ASSEMBLY_UNAVAILABLE"))
    await processClaimedFinalizationJob(job("S8"), dependencies)

    expect(dependencies.retryJob).toHaveBeenCalled()
    expect(events.some((event) => event.type === "overview.ready")).toBe(false)
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
  })

  it("publishes no completion after lease loss", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.renewJob).mockResolvedValueOnce(false)
    await processClaimedFinalizationJob(job("S8"), dependencies)

    expect(calls).not.toContain("stage.complete")
    expect(calls).not.toContain("advance.S9")
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })
})
