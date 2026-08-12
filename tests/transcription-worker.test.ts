import { describe, expect, it, vi } from "vitest"

import { TranscriptionError } from "@/lib/transcription/contracts"
import type { TranscriptionWorkerDependencies } from "@/lib/transcription/worker"
import { processClaimedTranscriptionJob } from "@/lib/transcription/worker"

const transcript = {
  source: "user_supplied" as const,
  language: null,
  segments: [
    {
      index: 0,
      startMs: 0,
      endMs: 0,
      text: "A user-supplied statement.",
      speakerLabel: null,
      asrConfidence: null,
      diarizationConfidence: null,
      lowConfidence: false,
    },
  ],
}

function fixture() {
  const calls: string[] = []
  const events: Array<Record<string, unknown>> = []
  const dependencies = {
    storage: {},
    providerFactory: vi.fn(() => ({
      transcribe: vi.fn(async () => transcript),
    })),
    claimJob: vi.fn(),
    renewJob: vi.fn(async () => true),
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
    loadSource: vi.fn(async () => {
      calls.push("source.load")
      return {
        analysisId: "analysis-id",
        status: "queued" as const,
        source: { type: "paste" as const, text: "A user-supplied statement." },
      }
    }),
    findTranscript: vi.fn(async () => {
      calls.push("transcript.find")
      return undefined
    }),
    persistTranscript: vi.fn(async () => {
      calls.push("transcript.persist")
      return { transcriptId: "10000000-0000-4000-8000-000000000001", created: true }
    }),

    resolveInput: vi.fn(async () => {
      calls.push("source.resolve")
      return { kind: "transcript" as const, transcript }
    }),
    failRunningAttempts: vi.fn(async () => {
      calls.push("stage.supersede")
    }),
    createAttempt: vi.fn(async () => {
      calls.push("stage.create")
      return {
        id: "stage-id",
        analysisId: "analysis-id",
        stage: "S1" as const,
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
    markSkipped: vi.fn(async () => {
      calls.push("stages.skip")
    }),
    claimExtractionEnabled: true,
    now: () => new Date("2030-01-01T00:00:00Z"),
  } as unknown as TranscriptionWorkerDependencies
  return { calls, dependencies, events }
}

const job = {
  id: "job-id",
  analysisId: "analysis-id",
  stage: "S1" as const,
  attempts: 1,
  lockToken: "20000000-0000-4000-8000-000000000001",
  lockedAt: new Date(),
}

describe("F2 worker orchestration", () => {
  it("persists S1 output and advances only to the analyzing boundary", async () => {
    const { calls, dependencies, events } = fixture()
    await processClaimedTranscriptionJob(job, dependencies)
    expect(calls).toEqual([
      "source.load",
      "transcript.find",
      "analysis.transcribing",
      "stage.supersede",
      "stage.create",
      "stage.running",
      "event.stage.status",
      "source.resolve",
      "transcript.persist",
      "stage.complete",
      "event.stage.status",
      "analysis.analyzing",
      "event.transcript.ready",
      "job.advance",
    ])
    expect(events).toContainEqual({
      type: "transcript.ready",
      transcript_id: "10000000-0000-4000-8000-000000000001",
    })
    expect(events.some((event) => event.type === "finding.batch")).toBe(false)
  })

  it("skips claim-dependent stages and advances directly to S8 when claims are disabled", async () => {
    const { calls, dependencies } = fixture()
    dependencies.claimExtractionEnabled = false

    await processClaimedTranscriptionJob(job, dependencies)

    expect(dependencies.markSkipped).toHaveBeenCalledWith("analysis-id", [
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
    ])
    expect(dependencies.advanceJob).toHaveBeenCalledWith("job-id", job.lockToken, "S1", "S8")
    expect(calls.indexOf("stages.skip")).toBeLessThan(calls.indexOf("job.advance"))
  })

  it("replays an already-persisted transcript without calling ASR again", async () => {
    const { calls, dependencies } = fixture()
    vi.mocked(dependencies.loadSource).mockImplementationOnce(async () => {
      calls.push("source.load")
      return {
        analysisId: "analysis-id",
        status: "transcribing",
        source: { type: "paste", text: "existing" },
      }
    })
    vi.mocked(dependencies.findTranscript).mockImplementationOnce(async () => {
      calls.push("transcript.find")
      return "10000000-0000-4000-8000-000000000001"
    })
    await processClaimedTranscriptionJob(job, dependencies)
    expect(calls).toEqual([
      "source.load",
      "transcript.find",
      "analysis.analyzing",
      "event.transcript.ready",
      "job.advance",
    ])
    expect(dependencies.resolveInput).not.toHaveBeenCalled()
    expect(dependencies.providerFactory).not.toHaveBeenCalled()
  })

  it("retries transient ASR failures without failing the analysis", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.resolveInput).mockImplementationOnce(async () => {
      calls.push("source.resolve")
      return { kind: "media", request: { mediaUrl: "https://storage.example/media" } }
    })
    vi.mocked(dependencies.providerFactory).mockReturnValueOnce({
      transcribe: vi.fn(async () => {
        throw new TranscriptionError("ASR_PROVIDER_UNAVAILABLE", "temporary", true)
      }),
    })
    await processClaimedTranscriptionJob(job, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("job.retry")
    expect(calls).not.toContain("analysis.failed")
    expect(calls).not.toContain("job.fail")
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "ASR_PROVIDER_UNAVAILABLE" }),
    )
  })

  it("fails honestly after a terminal transcription error", async () => {
    const { calls, dependencies, events } = fixture()
    vi.mocked(dependencies.resolveInput).mockImplementationOnce(async () => {
      calls.push("source.resolve")
      throw new TranscriptionError("TEXT_EXTRACTION_FAILED", "invalid document", false)
    })
    await processClaimedTranscriptionJob({ ...job, attempts: 3 }, dependencies)
    expect(calls).toContain("stage.failed")
    expect(calls).toContain("analysis.failed")
    expect(calls).toContain("job.fail")
    expect(calls).not.toContain("job.retry")
    expect(events).toContainEqual({ type: "analysis.done", status: "failed" })
    expect(events.some((event) => event.type === "transcript.ready")).toBe(false)
  })
})
