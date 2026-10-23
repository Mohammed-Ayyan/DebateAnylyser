import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { nextStageAfterS2 } from "@/lib/analysis/stage-routing"
import { recordInjectionFlags } from "@/lib/ai/injection-flag-repository"
import { StageOutputValidationError, runValidatedStage } from "@/lib/ai/stage-runner"
import { StageSchemaRegistry } from "@/lib/ai/schema-registry"
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
import {
  ClaimExtractionError,
  claimExtractionJsonSchema,
  type ClaimExtractionProvider,
  type ValidatedClaim,
} from "./contracts"
import { OllamaClaimExtractionProvider } from "./ollama-provider"
import { OpenAIClaimExtractionProvider } from "./openai-provider"
import { toTraceablePublicClaims } from "./public-claims"
import { getClaimStageSnapshot, loadClaimTranscript, persistClaims } from "./repository"
import {
  buildTranscriptWindows,
  deduplicateClaims,
  validateWindowClaims,
} from "./transcript-windows"

export type ClaimWorkerDependencies = {
  providerFactory: () => ClaimExtractionProvider
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadTranscript: typeof loadClaimTranscript
  getSnapshot: typeof getClaimStageSnapshot
  persist: typeof persistClaims
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  recordInjection: typeof recordInjectionFlags
  supportAssessmentEnabled: boolean
  evidenceRetrievalEnabled: boolean
  now: () => Date
}

function createDefaultProvider(): ClaimExtractionProvider {
  if (!serverEnv.CLAIM_EXTRACTION_ENABLED) {
    throw new ClaimExtractionError(
      "CLAIM_EXTRACTION_DISABLED",
      "Claim extraction is disabled.",
      false,
    )
  }
  if (serverEnv.CLAIM_PROVIDER === "ollama") {
    return new OllamaClaimExtractionProvider({
      baseUrl: serverEnv.OLLAMA_BASE_URL,
      model: serverEnv.OLLAMA_MODEL,
      numCtx: serverEnv.OLLAMA_NUM_CTX,
      numGpu: serverEnv.OLLAMA_NUM_GPU,
      timeoutMs: serverEnv.OLLAMA_REQUEST_TIMEOUT_MS,
    })
  }
  const { GROQ_API_KEY } = requireServerEnv("GROQ_API_KEY")
  return new OpenAIClaimExtractionProvider({
    apiKey: GROQ_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.CLAIM_MODEL,
    timeoutMs: serverEnv.CLAIM_REQUEST_TIMEOUT_MS,
    maxOutputTokens: serverEnv.CLAIM_MAX_OUTPUT_TOKENS,
  })
}

function defaultDependencies(): ClaimWorkerDependencies {
  return {
    providerFactory: createDefaultProvider,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadTranscript: loadClaimTranscript,
    getSnapshot: getClaimStageSnapshot,
    persist: persistClaims,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    recordInjection: recordInjectionFlags,
    supportAssessmentEnabled: serverEnv.SUPPORT_ASSESSMENT_ENABLED,
    evidenceRetrievalEnabled: serverEnv.EVIDENCE_RETRIEVAL_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof ClaimExtractionError) return { code: error.code, retryable: error.retryable }
  if (error instanceof StageOutputValidationError) {
    return { code: "CLAIM_OUTPUT_VALIDATION_FAILED", retryable: true }
  }
  return { code: "CLAIM_EXTRACTION_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new ClaimExtractionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

async function publishStage(
  dependencies: ClaimWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S2",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function publishClaims(
  dependencies: ClaimWorkerDependencies,
  analysisId: string,
  findings: ReturnType<typeof toTraceablePublicClaims>,
): Promise<void> {
  if (findings.length === 0) {
    await dependencies.appendEvent(analysisId, { type: "finding.batch", stage: "S2", findings: [] })
    return
  }
  for (let offset = 0; offset < findings.length; offset += 50) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S2",
      findings: findings.slice(offset, offset + 50),
    })
  }
}

async function finishClaimJob(
  dependencies: ClaimWorkerDependencies,
  job: ClaimedAnalysisJob,
): Promise<void> {
  const nextStage = nextStageAfterS2({
    supportAssessment: dependencies.supportAssessmentEnabled,
    argumentStructure: false,
    evidenceRetrieval: dependencies.evidenceRetrievalEnabled,
  })
  const completed = nextStage
    ? dependencies.advanceJob(job.id, job.lockToken, "S2", nextStage)
    : dependencies.completeJob(job.id, job.lockToken)
  await requireLease(completed)
}

export async function processClaimedClaimJob(
  job: ClaimedAnalysisJob,
  dependencies: ClaimWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S2") throw new Error(`Claim worker cannot process ${job.stage}`)
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
  pipelineLog("S2", "START", "", { analysisId: job.analysisId, attempt: job.attempts })
  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  try {
    const transcript = await dependencies.loadTranscript(job.analysisId)
    pipelineLog("S2", "INPUT", "", {
      segments: transcript.segments.length,
      transcriptChars: transcript.segments.reduce((sum, s) => sum + s.text.length, 0),
    })
    const validSegmentIds = new Set(transcript.segments.map((segment) => segment.id))
    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      await publishClaims(
        dependencies,
        job.analysisId,
        toTraceablePublicClaims(snapshot.findings, validSegmentIds),
      )
      await finishClaimJob(dependencies, job)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S2")
    stageRun = await dependencies.createAttempt(job.analysisId, "S2")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    let persisted = snapshot?.findings.length
      ? { created: false, findings: snapshot.findings }
      : undefined
    if (!persisted) {
      const registry = new StageSchemaRegistry()
      registry.register(serverEnv.CLAIM_SCHEMA_VERSION, claimExtractionJsonSchema)
      const provider = dependencies.providerFactory()
      const windows = buildTranscriptWindows(
        transcript.segments,
        serverEnv.CLAIM_WINDOW_MAX_CHARS,
        serverEnv.CLAIM_WINDOW_OVERLAP_SEGMENTS,
      )
      const extracted: ValidatedClaim[] = []
      for (const window of windows) {
        pipelineLog("S2", "PROVIDER", "Sending request", { model: serverEnv.CLAIM_MODEL })
        const _windowStart = pipelineNow()
        const result = await runValidatedStage<ValidatedClaim[]>({
          stage: "S2",
          schemaKey: serverEnv.CLAIM_SCHEMA_VERSION,
          source: window.source,
          registry,
          maxAttempts: serverEnv.CLAIM_SCHEMA_MAX_ATTEMPTS,
          recordInjectionSignals: (signals) =>
            dependencies.recordInjection(job.analysisId, signals),
          invoke: ({ sourceBlock }) =>
            provider.extract(
              {
                sourceBlock,
                promptVersion: serverEnv.CLAIM_PROMPT_VERSION,
                schemaVersion: serverEnv.CLAIM_SCHEMA_VERSION,
                maxClaims: serverEnv.CLAIM_MAX_CLAIMS_PER_WINDOW,
              },
              abortController.signal,
            ),
          transformValidated: (candidate) =>
            validateWindowClaims(candidate, window, serverEnv.CLAIM_MAX_CLAIMS_PER_WINDOW),
        })
        extracted.push(...result.output)
        pipelineLog("S2", "PROVIDER", "Response received", {
          elapsed: pipelineElapsed(_windowStart),
        })
        if (leaseLost) {
          throw new ClaimExtractionError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
        }
      }
      persisted = await dependencies.persist(job.analysisId, deduplicateClaims(extracted), {
        promptVersion: serverEnv.CLAIM_PROMPT_VERSION,
        schemaVersion: serverEnv.CLAIM_SCHEMA_VERSION,
      })
    }

    const publicFindings = toTraceablePublicClaims(persisted.findings, validSegmentIds)
    if (publicFindings.length !== persisted.findings.length) {
      throw new ClaimExtractionError(
        "CLAIM_TRACEABILITY_FAILED",
        "An extracted claim failed the traceability gate.",
        false,
      )
    }
    pipelineLog("S2", "VALIDATION", "Schema validation passed", { claims: publicFindings.length })
    pipelineLog("S2", "DB", "Persisting", { claims: publicFindings.length })
    await dependencies.transitionStage(stageRun.id, "running", "complete")
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishClaims(dependencies, job.analysisId, publicFindings)
    pipelineLog("S2", "DB", "Persistence complete", {})
    await finishClaimJob(dependencies, job)
    pipelineLog("S2", "COMPLETE", "", { duration: pipelineElapsed(_pipelineStart) })
  } catch (error) {
    const details = errorDetails(error)
    pipelineLog("S2", "ERROR", "", { code: details.code, retryable: details.retryable })
    logger.error("claim_extraction.job_failed", {
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
        logger.warn("claim_extraction.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      pipelineLog("S2", "RETRY", "", {
        attempt: `${job.attempts + 1}/${serverEnv.WORKER_MAX_ATTEMPTS}`,
        delaySeconds: retryDelay(job.attempts),
      })
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Claim extraction was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }
    await dependencies.transitionAnalysis(job.analysisId, "analyzing", "failed")
    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message: "Claims could not be extracted without inventing or losing transcript anchors.",
    })
    await dependencies.appendEvent(job.analysisId, { type: "analysis.done", status: "failed" })
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextClaimJob(
  dependencies: ClaimWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S2")
  if (!job) return false
  await processClaimedClaimJob(job, dependencies)
  return true
}
