import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { CLAIM_DEPENDENT_STAGES, markStagesSkipped } from "@/lib/analysis/skipped-stages"
import { nextStageAfterS1 } from "@/lib/analysis/stage-routing"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { logger } from "@/lib/observability/logger"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  advanceAnalysisJobStage,
  claimAnalysisJob,
  completeAnalysisJob,
  failAnalysisJob,
  renewAnalysisJobLease,
  retryAnalysisJob,
  type ClaimedAnalysisJob,
} from "@/lib/queue/analysis-jobs"
import { S3ObjectStorage } from "@/lib/storage/s3-storage"
import type { ObjectStorage } from "@/lib/storage/types"
import { TranscriptionError, type TranscriptionProvider } from "./contracts"
import { DeepgramTranscriptionProvider } from "./deepgram-adapter"
import { DevelopmentTextUrlProvider } from "./development-text-url-provider"
import { resolveTranscriptionInput } from "./source-resolver"
import { loadAnalysisSource } from "./source-repository"
import { findTranscriptId, persistTranscript } from "./transcript-repository"

export type TranscriptionWorkerDependencies = {
  storage: ObjectStorage
  providerFactory: () => TranscriptionProvider
  claimJob: typeof claimAnalysisJob
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadSource: typeof loadAnalysisSource
  findTranscript: typeof findTranscriptId
  persistTranscript: typeof persistTranscript
  resolveInput: typeof resolveTranscriptionInput
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  markSkipped: typeof markStagesSkipped
  claimExtractionEnabled: boolean
  now: () => Date
}

function createDefaultProvider(): TranscriptionProvider {
  if (
    !serverEnv.DEEPGRAM_API_KEY &&
    serverEnv.APP_ENV === "dev" &&
    serverEnv.LEGAL_DEVELOPMENT_TEST_MODE
  ) {
    return new DevelopmentTextUrlProvider(
      serverEnv.TRANSCRIPT_TEXT_MAX_BYTES,
      serverEnv.ASR_TIMEOUT_MS,
    )
  }
  const { DEEPGRAM_API_KEY } = requireServerEnv("DEEPGRAM_API_KEY")
  return new DeepgramTranscriptionProvider({
    apiKey: DEEPGRAM_API_KEY,
    apiUrl: serverEnv.DEEPGRAM_API_URL,
    model: serverEnv.DEEPGRAM_MODEL,
    diarizationModel: serverEnv.DEEPGRAM_DIARIZATION_MODEL,
    timeoutMs: serverEnv.ASR_TIMEOUT_MS,
    asrLowConfidenceThreshold: serverEnv.ASR_LOW_CONFIDENCE_THRESHOLD,
    diarizationLowConfidenceThreshold: serverEnv.DIARIZATION_LOW_CONFIDENCE_THRESHOLD,
  })
}

function defaultDependencies(): TranscriptionWorkerDependencies {
  return {
    storage: new S3ObjectStorage(),
    providerFactory: createDefaultProvider,
    claimJob: claimAnalysisJob,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadSource: loadAnalysisSource,
    findTranscript: findTranscriptId,
    persistTranscript,
    resolveInput: resolveTranscriptionInput,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    markSkipped: markStagesSkipped,
    claimExtractionEnabled: serverEnv.CLAIM_EXTRACTION_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof TranscriptionError) {
    return { code: error.code, retryable: error.retryable }
  }
  return { code: "TRANSCRIPTION_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new TranscriptionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

async function publishStage(
  dependencies: TranscriptionWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S1",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function advanceFromS1(
  job: ClaimedAnalysisJob,
  dependencies: TranscriptionWorkerDependencies,
): Promise<void> {
  const nextStage = nextStageAfterS1(dependencies.claimExtractionEnabled)
  if (nextStage === "S8") {
    await dependencies.markSkipped(job.analysisId, CLAIM_DEPENDENT_STAGES)
  }
  await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S1", nextStage))
}

async function finishExistingTranscript(
  job: ClaimedAnalysisJob,
  status: "queued" | "transcribing" | "analyzing",
  transcriptId: string,
  dependencies: TranscriptionWorkerDependencies,
): Promise<void> {
  if (status === "queued") {
    await dependencies.transitionAnalysis(job.analysisId, "queued", "transcribing")
    status = "transcribing"
  }
  if (status === "transcribing") {
    await dependencies.transitionAnalysis(job.analysisId, "transcribing", "analyzing")
  }
  await dependencies.appendEvent(job.analysisId, {
    type: "transcript.ready",
    transcript_id: transcriptId,
  })
  await advanceFromS1(job, dependencies)
}

export async function processClaimedTranscriptionJob(
  job: ClaimedAnalysisJob,
  dependencies: TranscriptionWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S1") throw new Error(`Transcription worker cannot process ${job.stage}`)
  const abortController = new AbortController()
  let leaseLost = false
  const heartbeat = setInterval(
    () => {
      void dependencies.renewJob(job.id, job.lockToken).then((renewed) => {
        if (!renewed) {
          leaseLost = true
          abortController.abort(new Error("Worker lease lost"))
        }
      })
    },
    Math.max(10_000, Math.floor((serverEnv.WORKER_JOB_LEASE_SECONDS * 1_000) / 3)),
  )
  heartbeat.unref?.()

  const _pipelineStart = pipelineNow()
  pipelineLog("S1", "START", "", { analysisId: job.analysisId, attempt: job.attempts })
  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let analysisStatus: Awaited<ReturnType<typeof loadAnalysisSource>>["status"] | undefined
  try {
    const loaded = await dependencies.loadSource(job.analysisId)
    analysisStatus = loaded.status
    const existingTranscriptId = await dependencies.findTranscript(job.analysisId)
    if (existingTranscriptId) {
      if (
        loaded.status === "queued" ||
        loaded.status === "transcribing" ||
        loaded.status === "analyzing"
      ) {
        await finishExistingTranscript(job, loaded.status, existingTranscriptId, dependencies)
      } else {
        await requireLease(dependencies.completeJob(job.id, job.lockToken))
      }
      return
    }
    if (loaded.status === "queued") {
      await dependencies.transitionAnalysis(job.analysisId, "queued", "transcribing")
      analysisStatus = "transcribing"
    } else if (loaded.status !== "transcribing") {
      throw new TranscriptionError(
        "ANALYSIS_STATUS_INVALID",
        "The analysis is not ready for transcription.",
        false,
      )
    }

    await dependencies.failRunningAttempts(job.analysisId, "S1")
    stageRun = await dependencies.createAttempt(job.analysisId, "S1")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    const input = await dependencies.resolveInput(loaded.source, dependencies.storage)
    pipelineLog("S1", "INPUT", "Source resolved", { kind: input.kind })
    const _providerStart = pipelineNow()
    pipelineLog("S1", "PROVIDER", "Sending request", { kind: input.kind })
    const output =
      input.kind === "transcript"
        ? input.transcript
        : await dependencies.providerFactory().transcribe(input.request, abortController.signal)
    pipelineLog("S1", "PROVIDER", "Response received", { elapsed: pipelineElapsed(_providerStart) })
    if (leaseLost)
      throw new TranscriptionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
    pipelineLog("S1", "DB", "Persisting transcript", { segments: output.segments.length })
    const transcript = await dependencies.persistTranscript(job.analysisId, output)
    pipelineLog("S1", "DB", "Persistence complete", {})
    await dependencies.transitionStage(stageRun.id, "running", "complete")
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await dependencies.transitionAnalysis(job.analysisId, "transcribing", "analyzing")
    analysisStatus = "analyzing"
    await dependencies.appendEvent(job.analysisId, {
      type: "transcript.ready",
      transcript_id: transcript.transcriptId,
    })
    await advanceFromS1(job, dependencies)
    pipelineLog("S1", "COMPLETE", "", { duration: pipelineElapsed(_pipelineStart) })
  } catch (error) {
    const details = errorDetails(error)
    pipelineLog("S1", "ERROR", "", { code: details.code, retryable: details.retryable })
    logger.error("transcription.job_failed", {
      analysisId: job.analysisId,
      jobId: job.id,
      attempt: job.attempts,
      errorClass: details.code,
      retryable: details.retryable,
      error,
    })

    if (leaseLost || details.code === "WORKER_LEASE_LOST") return
    if (stageRun) {
      try {
        await dependencies.transitionStage(stageRun.id, "running", "failed", details.code)
        await publishStage(dependencies, job.analysisId, "failed", stageRun.attempt, details.code)
      } catch (stageError) {
        logger.warn("transcription.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      pipelineLog("S1", "RETRY", "", {
        attempt: `${job.attempts + 1}/${serverEnv.WORKER_MAX_ATTEMPTS}`,
        delaySeconds: retryDelay(job.attempts),
      })
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Transcription was interrupted and will be retried.",
      })
      const retried = await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      if (!retried) return
      return
    }

    if (analysisStatus === "queued") {
      await dependencies.transitionAnalysis(job.analysisId, "queued", "failed")
    } else if (analysisStatus === "transcribing") {
      await dependencies.transitionAnalysis(job.analysisId, "transcribing", "failed")
    }
    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message:
        details.code === "ASR_EMPTY_TRANSCRIPT"
          ? "No intelligible speech was detected. Try a clearer recording or paste a transcript."
          : "Transcription could not be completed. Try a supported source or paste a transcript.",
    })
    await dependencies.appendEvent(job.analysisId, {
      type: "analysis.done",
      status: "failed",
    })
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextTranscriptionJob(
  dependencies: TranscriptionWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await dependencies.claimJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S1")
  if (!job) return false
  await processClaimedTranscriptionJob(job, dependencies)
  return true
}

export async function runTranscriptionWorker(
  signal: AbortSignal,
  dependencies: TranscriptionWorkerDependencies = defaultDependencies(),
): Promise<void> {
  while (!signal.aborted) {
    const processed = await processNextTranscriptionJob(dependencies)
    if (processed) continue
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, serverEnv.WORKER_POLL_INTERVAL_MS)
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout)
          resolve()
        },
        { once: true },
      )
    })
  }
}
