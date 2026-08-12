import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import { nextStageAfterS3 } from "@/lib/analysis/stage-routing"
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
import { prepareSupportCalls, validateSupportAssessments } from "./assessment"
import {
  SupportAssessmentError,
  supportAssessmentJsonSchema,
  type SupportAssessmentProvider,
  type ValidatedSupport,
} from "./contracts"
import { OpenAISupportAssessmentProvider } from "./openai-provider"
import { toTraceablePublicSupport } from "./public-support"
import { getSupportStageSnapshot, loadSupportInput, persistSupportAssessments } from "./repository"

export type SupportWorkerDependencies = {
  providerFactory: () => SupportAssessmentProvider
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadInput: typeof loadSupportInput
  getSnapshot: typeof getSupportStageSnapshot
  persist: typeof persistSupportAssessments
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  recordInjection: typeof recordInjectionFlags
  argumentStructureEnabled: boolean
  evidenceRetrievalEnabled: boolean
  now: () => Date
}

function createDefaultProvider(): SupportAssessmentProvider {
  if (!serverEnv.SUPPORT_ASSESSMENT_ENABLED) {
    throw new SupportAssessmentError(
      "SUPPORT_ASSESSMENT_DISABLED",
      "Speaker support assessment is disabled.",
      false,
    )
  }
  const { GROQ_API_KEY } = requireServerEnv("GROQ_API_KEY")
  return new OpenAISupportAssessmentProvider({
    apiKey: GROQ_API_KEY,
    apiUrl: serverEnv.OPENAI_RESPONSES_URL,
    model: serverEnv.SUPPORT_MODEL,
    timeoutMs: serverEnv.SUPPORT_REQUEST_TIMEOUT_MS,
    maxOutputTokens: serverEnv.SUPPORT_MAX_OUTPUT_TOKENS,
  })
}

function defaultDependencies(): SupportWorkerDependencies {
  return {
    providerFactory: createDefaultProvider,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadInput: loadSupportInput,
    getSnapshot: getSupportStageSnapshot,
    persist: persistSupportAssessments,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    recordInjection: recordInjectionFlags,
    argumentStructureEnabled: serverEnv.ARGUMENT_STRUCTURE_ENABLED,
    evidenceRetrievalEnabled: serverEnv.EVIDENCE_RETRIEVAL_ENABLED,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof SupportAssessmentError)
    return { code: error.code, retryable: error.retryable }
  if (error instanceof StageOutputValidationError) {
    return { code: "SUPPORT_OUTPUT_VALIDATION_FAILED", retryable: true }
  }
  return { code: "SUPPORT_ASSESSMENT_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new SupportAssessmentError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

async function publishStage(
  dependencies: SupportWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S3",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function publishSupport(
  dependencies: SupportWorkerDependencies,
  analysisId: string,
  findings: ReturnType<typeof toTraceablePublicSupport>,
): Promise<void> {
  if (findings.length === 0) {
    await dependencies.appendEvent(analysisId, { type: "finding.batch", stage: "S3", findings: [] })
    return
  }
  for (let offset = 0; offset < findings.length; offset += 50) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S3",
      findings: findings.slice(offset, offset + 50),
    })
  }
}

async function finishAtF4Boundary(
  dependencies: SupportWorkerDependencies,
  analysisId: string,
  status: "analyzing" | "partial",
): Promise<void> {
  if (status === "analyzing") {
    await dependencies.transitionAnalysis(analysisId, "analyzing", "partial")
  }
  await dependencies.appendEvent(analysisId, { type: "analysis.done", status: "partial" })
}

async function finishSupportJob(
  dependencies: SupportWorkerDependencies,
  job: ClaimedAnalysisJob,
  status: "analyzing" | "partial",
): Promise<void> {
  const nextStage = nextStageAfterS3({
    supportAssessment: true,
    argumentStructure: dependencies.argumentStructureEnabled,
    evidenceRetrieval: dependencies.evidenceRetrievalEnabled,
  })
  if (nextStage) {
    await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S3", nextStage))
    return
  }
  await finishAtF4Boundary(dependencies, job.analysisId, status)
  await requireLease(dependencies.completeJob(job.id, job.lockToken))
}

export async function processClaimedSupportJob(
  job: ClaimedAnalysisJob,
  dependencies: SupportWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S3") throw new Error(`Support worker cannot process ${job.stage}`)
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
  pipelineLog("S3", "START", "", { analysisId: job.analysisId, attempt: job.attempts })
  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let inputStatus: "analyzing" | "partial" | undefined
  try {
    const input = await dependencies.loadInput(job.analysisId)
    pipelineLog("S3", "INPUT", "", { segments: input.segments.length, claims: input.claims?.length ?? 0 })
    inputStatus = input.status
    const validSegmentIds = new Set(input.segments.map((segment) => segment.id))
    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      await requireLease(dependencies.renewJob(job.id, job.lockToken))
      await publishSupport(
        dependencies,
        job.analysisId,
        toTraceablePublicSupport(snapshot.findings, validSegmentIds),
      )
      await finishSupportJob(dependencies, job, input.status)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S3")
    stageRun = await dependencies.createAttempt(job.analysisId, "S3")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    let persisted = snapshot?.findings.length
      ? { created: false, findings: snapshot.findings }
      : undefined
    if (!persisted) {
      const prepared = prepareSupportCalls(
        input,
        serverEnv.SUPPORT_CONTEXT_MAX_CHARS,
        serverEnv.SUPPORT_MAX_CLAIMS_PER_CALL,
      )
      const assessed: ValidatedSupport[] = [...prepared.deterministic]
      if (prepared.calls.length > 0) {
        const registry = new StageSchemaRegistry()
        registry.register(serverEnv.SUPPORT_SCHEMA_VERSION, supportAssessmentJsonSchema)
        const provider = dependencies.providerFactory()
        for (const call of prepared.calls) {
          pipelineLog("S3", "PROVIDER", "Sending request", { model: serverEnv.SUPPORT_MODEL })
          const _callStart = pipelineNow()
          const result = await runValidatedStage<ValidatedSupport[]>({
            stage: "S3",
            schemaKey: serverEnv.SUPPORT_SCHEMA_VERSION,
            source: call.source,
            registry,
            maxAttempts: serverEnv.SUPPORT_SCHEMA_MAX_ATTEMPTS,
            recordInjectionSignals: (signals) =>
              dependencies.recordInjection(job.analysisId, signals),
            invoke: ({ sourceBlock }) =>
              provider.assess(
                {
                  sourceBlock,
                  promptVersion: serverEnv.SUPPORT_PROMPT_VERSION,
                  schemaVersion: serverEnv.SUPPORT_SCHEMA_VERSION,
                  maxClaims: serverEnv.SUPPORT_MAX_CLAIMS_PER_CALL,
                },
                abortController.signal,
              ),
            transformValidated: (candidate) => validateSupportAssessments(candidate, call),
          })
          assessed.push(...result.output)
          pipelineLog("S3", "PROVIDER", "Response received", { elapsed: pipelineElapsed(_callStart) })
          if (leaseLost) {
            throw new SupportAssessmentError(
              "WORKER_LEASE_LOST",
              "The worker lease was lost.",
              true,
            )
          }
        }
      }
      persisted = await dependencies.persist(job.analysisId, assessed, {
        promptVersion: serverEnv.SUPPORT_PROMPT_VERSION,
        schemaVersion: serverEnv.SUPPORT_SCHEMA_VERSION,
      })
    }

    const publicFindings = toTraceablePublicSupport(persisted.findings, validSegmentIds)
    if (publicFindings.length !== persisted.findings.length) {
      throw new SupportAssessmentError(
        "SUPPORT_TRACEABILITY_FAILED",
        "A support assessment failed the traceability gate.",
        false,
      )
    }
    pipelineLog("S3", "VALIDATION", "Schema validation passed", { findings: publicFindings.length })
    pipelineLog("S3", "DB", "Persisting", { findings: publicFindings.length })
    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    await dependencies.transitionStage(stageRun.id, "running", "complete")
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishSupport(dependencies, job.analysisId, publicFindings)
    pipelineLog("S3", "DB", "Persistence complete", {})
    await finishSupportJob(dependencies, job, input.status)
    pipelineLog("S3", "COMPLETE", "", { duration: pipelineElapsed(_pipelineStart) })
  } catch (error) {
    const details = errorDetails(error)
    pipelineLog("S3", "ERROR", "", { code: details.code, retryable: details.retryable })
    logger.error("support_assessment.job_failed", {
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
        logger.warn("support_assessment.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      pipelineLog("S3", "RETRY", "", {
        attempt: `${job.attempts + 1}/${serverEnv.WORKER_MAX_ATTEMPTS}`,
        delaySeconds: retryDelay(job.attempts),
      })
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Speaker support assessment was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }
    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message: "Speaker support could not be assessed reliably; existing claims were preserved.",
    })
    if (inputStatus && dependencies.evidenceRetrievalEnabled) {
      await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S3", "S6"))
      return
    }
    if (inputStatus) {
      try {
        await finishAtF4Boundary(dependencies, job.analysisId, inputStatus)
      } catch (boundaryError) {
        logger.warn("support_assessment.partial_boundary_failed", {
          analysisId: job.analysisId,
          originalErrorClass: details.code,
          error: boundaryError,
        })
      }
    }
    await dependencies.failJob(job.id, job.lockToken, details.code)
  } finally {
    clearInterval(heartbeat)
  }
}

export async function processNextSupportJob(
  dependencies: SupportWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S3")
  if (!job) return false
  await processClaimedSupportJob(job, dependencies)
  return true
}
