import { describe, expect, it, vi } from "vitest"

import type { EvidenceSource, InternalCredibilityFinding } from "@/lib/contracts/analysis"
import type { CredibilityRating } from "@/lib/credibility/contracts"
import { CredibilityProviderError } from "@/lib/credibility/http-provider"
import type { CredibilityWorkerDependencies } from "@/lib/credibility/worker"
import { processClaimedCredibilityJob } from "@/lib/credibility/worker"

const analysisId = "00000000-0000-4000-8000-000000000001"
const sourceId = "00000000-0000-4000-8000-000000000002"
const findingId = "00000000-0000-4000-8000-000000000003"

const source: EvidenceSource = {
  id: sourceId,
  analysis_id: analysisId,
  url: "https://news.example/report",
  retrieved_snippet: "The verified report contains the cited evidence.",
  provenance: "Verified report",
  tier: "T2",
  resolves: true,
  supports_relation: "supports",
  licensing_quote_verified: true,
  retrieved_at: "2030-01-01T00:00:00.000Z",
  credibility_ratings: [],
  credibility_disagreement: false,
}

const ratings: CredibilityRating[] = [
  {
    factor: "editorial_standards",
    level: "higher",
    provenance: { method_name: "Published methodology", rater_reference: "rater-alpha" },
    contested_note: "This categorical assessment remains contestable.",
  },
  {
    factor: "editorial_standards",
    level: "lower",
    provenance: { method_name: "Independent review", rater_reference: "rater-beta" },
    contested_note: "The independent review reaches a different category.",
  },
]

const credibilityFinding: InternalCredibilityFinding = {
  id: findingId,
  analysis_id: analysisId,
  kind: "credibility",
  text: "Categorical source credibility ratings disagree for this verified source.",
  paraphrase: false,
  confidence_band: null,
  state: "contested",
  person_involved: false,
  span_refs: [],
  evidence_refs: [sourceId],
  produced_by_stage: "S7",
  credibility: { source_id: sourceId },
}

const job = {
  id: "job-id",
  analysisId,
  stage: "S7" as const,
  attempts: 1,
  lockToken: "00000000-0000-4000-8000-000000000004",
  lockedAt: new Date(),
}

function fixture(inputSources: EvidenceSource[] = [source]) {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    providerFactory: vi.fn(() => ({
      assess: vi.fn(async () => ({ ratings })),
    })),
    renewJob: vi.fn(async () => {
      calls.push("job.renew")
      return true
    }),
    advanceJob: vi.fn(async () => {
      calls.push("job.advance")
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
      calls.push("credibility.load")
      return { analysisId, status: "partial" as const, sources: inputSources }
    }),
    getSnapshot: vi.fn(async () => {
      calls.push("credibility.snapshot")
      return undefined
    }),
    persist: vi.fn(
      async (_id, assessments: Parameters<CredibilityWorkerDependencies["persist"]>[1]) => {
        calls.push("credibility.persist")
        return {
          created: true,
          findings: assessments.some((assessment) => assessment.ratings.length > 0)
            ? [credibilityFinding]
            : [],
        }
      },
    ),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId,
        stage: "S7" as const,
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
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  } as unknown as CredibilityWorkerDependencies
  return { calls, dependencies, events }
}

describe("S7 credibility worker orchestration", () => {
  it("persists categorical ratings and publishes one source-anchored finding", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedCredibilityJob(job, dependencies)

    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      [{ sourceId, ratings }],
      "stage-id",
    )
    expect(calls.indexOf("credibility.persist")).toBeLessThan(
      calls.lastIndexOf("event.stage.status"),
    )
    const batch = events.find((event) => event.type === "finding.batch")
    expect(batch).toMatchObject({
      stage: "S7",
      findings: [
        {
          kind: "credibility",
          state: "contested",
          evidence_refs: [sourceId],
          credibility: { source_id: sourceId },
        },
      ],
    })
    expect(JSON.stringify(batch)).not.toContain('"confidence"')
    expect(JSON.stringify(batch)).not.toMatch(/"score"|"rank"/i)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(calls.at(-1)).toBe("job.advance")
  })

  it("completes an empty verified-source input without provider calls or invention", async () => {
    const { calls, dependencies, events } = fixture([])
    await processClaimedCredibilityJob(job, dependencies)

    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).toHaveBeenCalledWith(analysisId, [], "stage-id")
    expect(events).toContainEqual({ type: "finding.batch", stage: "S7", findings: [] })
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(calls).toContain("job.advance")
  })

  it("accepts empty provider ratings as a complete result without a synthetic finding", async () => {
    const { dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => ({ ratings: [] })),
    })
    await processClaimedCredibilityJob(job, dependencies)

    expect(dependencies.persist).toHaveBeenCalledWith(
      analysisId,
      [{ sourceId, ratings: [] }],
      "stage-id",
    )
    expect(events).toContainEqual({ type: "finding.batch", stage: "S7", findings: [] })
  })

  it("replays completed S7 output without provider calls or persistence", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.getSnapshot).mockResolvedValueOnce({
      status: "complete",
      attempt: 1,
      findings: [credibilityFinding],
    })
    await processClaimedCredibilityJob(job, dependencies)

    expect(dependencies.providerFactory).not.toHaveBeenCalled()
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events.find((event) => event.type === "finding.batch")).toMatchObject({
      stage: "S7",
      findings: [expect.objectContaining({ evidence_refs: [sourceId] })],
    })
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
    expect(calls).toContain("job.advance")
  })

  it("retries a transient provider failure without publishing completion", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => {
        throw new CredibilityProviderError("CREDIBILITY_PROVIDER_UNAVAILABLE", "temporary", true)
      }),
    })
    await processClaimedCredibilityJob(job, dependencies)

    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("isolates terminal S7 failure and preserves verified S6 sources", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      assess: vi.fn(async () => {
        throw new CredibilityProviderError(
          "CREDIBILITY_PROVIDER_AUTHENTICATION_FAILED",
          "rejected",
          false,
        )
      }),
    })
    await processClaimedCredibilityJob({ ...job, attempts: 3 }, dependencies)

    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.advance")
    expect(calls).not.toContain("analysis.partial")
    expect(calls).not.toContain("job.fail")
    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(await dependencies.loadInput(analysisId)).toMatchObject({ sources: [source] })
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })

  it("publishes no completion or output after lease loss", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.renewJob).mockImplementationOnce(async () => {
      calls.push("job.renew")
      return false
    })
    await processClaimedCredibilityJob(job, dependencies)

    expect(dependencies.persist).not.toHaveBeenCalled()
    expect(calls).not.toContain("job.complete")
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
    expect(
      events.some((event) => event.type === "stage.status" && event.status === "complete"),
    ).toBe(false)
    expect(events.some((event) => event.type === "analysis.done")).toBe(false)
  })
})
