import "server-only"

import { ZodError } from "zod"

import { createStageAttempt, transitionAnalysisStatus } from "@/lib/analysis/lifecycle-repository"
import { nextStageAfterS7 } from "@/lib/analysis/stage-routing"
import { failRunningStageAttempts, transitionStageRun } from "@/lib/analysis/stage-run-repository"
import {
  publicCredibilityFindingSchema,
  type PublicCredibilityFinding,
} from "@/lib/contracts/analysis"
import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { logger } from "@/lib/observability/logger"
import {
  advanceAnalysisJobStage,
  claimAnalysisJob,
  completeAnalysisJob,
  failAnalysisJob,
  renewAnalysisJobLease,
  retryAnalysisJob,
  type ClaimedAnalysisJob,
} from "@/lib/queue/analysis-jobs"
import type { CredibilityProvider } from "./contracts"
import { CredibilityProviderError, HttpCredibilityProvider } from "./http-provider"
import {
  CredibilityStageError,
  getCredibilityStageSnapshot,
  loadCredibilityInput,
  persistCredibilityAssessments,
  type SourceCredibilityAssessment,
} from "./repository"
import { validateCredibilityProviderOutput } from "./validation"

export type CredibilityWorkerDependencies = {
  providerFactory: () => CredibilityProvider
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  loadInput: typeof loadCredibilityInput
  getSnapshot: typeof getCredibilityStageSnapshot
  persist: typeof persistCredibilityAssessments
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  now: () => Date
}

function createDefaultProvider(): CredibilityProvider {
  if (!serverEnv.SOURCE_CREDIBILITY_ENABLED) {
    throw new CredibilityStageError(
      "SOURCE_CREDIBILITY_DISABLED",
      "Source credibility assessment is disabled.",
      false,
    )
  }
  const { CREDIBILITY_PROVIDER_URL, CREDIBILITY_PROVIDER_API_KEY } = requireServerEnv(
    "CREDIBILITY_PROVIDER_URL",
    "CREDIBILITY_PROVIDER_API_KEY",
  )
  return new HttpCredibilityProvider({
    endpoint: CREDIBILITY_PROVIDER_URL,
    timeoutMs: serverEnv.CREDIBILITY_PROVIDER_TIMEOUT_MS,
    headers: { authorization: `Bearer ${CREDIBILITY_PROVIDER_API_KEY}` },
  })
}

function defaultDependencies(): CredibilityWorkerDependencies {
  return {
    providerFactory: createDefaultProvider,
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    loadInput: loadCredibilityInput,
    getSnapshot: getCredibilityStageSnapshot,
    persist: persistCredibilityAssessments,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    now: () => new Date(),
  }
}

function errorDetails(error: unknown): { code: string; retryable: boolean } {
  if (error instanceof CredibilityStageError || error instanceof CredibilityProviderError) {
    return { code: error.code, retryable: error.retryable }
  }
  if (error instanceof ZodError) {
    return { code: "CREDIBILITY_PROVIDER_INVALID_RESPONSE", retryable: true }
  }
  return { code: "CREDIBILITY_INTERNAL_ERROR", retryable: true }
}

function retryDelay(attempt: number): number {
  return Math.min(900, 30 * 2 ** Math.max(0, attempt - 1))
}

async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) {
    throw new CredibilityStageError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
  }
}

async function publishStage(
  dependencies: CredibilityWorkerDependencies,
  analysisId: string,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await dependencies.appendEvent(analysisId, {
    type: "stage.status",
    stage: "S7",
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

function toPublicFindings(
  findings: Parameters<typeof publicCredibilityFindingSchema.parse>[0][],
): PublicCredibilityFinding[] {
  return findings.map((finding) => publicCredibilityFindingSchema.parse(finding))
}

async function publishFindings(
  dependencies: CredibilityWorkerDependencies,
  analysisId: string,
  findings: PublicCredibilityFinding[],
): Promise<void> {
  if (findings.length === 0) {
    await dependencies.appendEvent(analysisId, { type: "finding.batch", stage: "S7", findings: [] })
    return
  }
  for (let offset = 0; offset < findings.length; offset += 50) {
    await dependencies.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S7",
      findings: findings.slice(offset, offset + 50),
    })
  }
}

async function advanceToAssembly(
  dependencies: CredibilityWorkerDependencies,
  job: ClaimedAnalysisJob,
): Promise<void> {
  await requireLease(dependencies.advanceJob(job.id, job.lockToken, "S7", nextStageAfterS7()))
}

export async function processClaimedCredibilityJob(
  job: ClaimedAnalysisJob,
  dependencies: CredibilityWorkerDependencies = defaultDependencies(),
): Promise<void> {
  if (job.stage !== "S7") throw new Error(`Credibility worker cannot process ${job.stage}`)
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

  let stageRun: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  let analysisActive = false
  try {
    const input = await dependencies.loadInput(job.analysisId)
    if (input.status === "partial") {
      await dependencies.transitionAnalysis(job.analysisId, "partial", "analyzing")
    }
    analysisActive = true

    const snapshot = await dependencies.getSnapshot(job.analysisId, true)
    if (snapshot?.status === "complete") {
      await requireLease(dependencies.renewJob(job.id, job.lockToken))
      await publishFindings(dependencies, job.analysisId, toPublicFindings(snapshot.findings))
      await advanceToAssembly(dependencies, job)
      return
    }

    await dependencies.failRunningAttempts(job.analysisId, "S7")
    stageRun = await dependencies.createAttempt(job.analysisId, "S7")
    await dependencies.transitionStage(stageRun.id, "pending", "running")
    await publishStage(dependencies, job.analysisId, "running", stageRun.attempt)

    const assessments: SourceCredibilityAssessment[] = []
    if (input.sources.length > 0) {
      const provider = dependencies.providerFactory()
      for (const source of input.sources) {
        const output = validateCredibilityProviderOutput(
          await provider.assess({ source_url: source.url }, abortController.signal),
        )
        assessments.push({ sourceId: source.id, ratings: output.ratings })
        if (leaseLost) {
          throw new CredibilityStageError("WORKER_LEASE_LOST", "The worker lease was lost.", true)
        }
      }
    }

    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    const persisted = await dependencies.persist(job.analysisId, assessments, stageRun.id)
    const sourceIds = new Set(input.sources.map((source) => source.id))
    const traceable = persisted.findings.every(
      (finding) =>
        finding.evidence_refs.length === 1 &&
        finding.evidence_refs[0] === finding.credibility.source_id &&
        sourceIds.has(finding.credibility.source_id),
    )
    if (!traceable) {
      throw new CredibilityStageError(
        "CREDIBILITY_TRACEABILITY_FAILED",
        "A credibility finding failed the verified-source traceability gate.",
        false,
      )
    }

    await requireLease(dependencies.renewJob(job.id, job.lockToken))
    await publishStage(dependencies, job.analysisId, "complete", stageRun.attempt)
    await publishFindings(dependencies, job.analysisId, toPublicFindings(persisted.findings))
    await advanceToAssembly(dependencies, job)
  } catch (error) {
    const details = errorDetails(error)
    logger.error("source_credibility.job_failed", {
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
        logger.warn("source_credibility.stage_failure_record_failed", {
          analysisId: job.analysisId,
          stageRunId: stageRun.id,
          error: stageError,
        })
      }
    }
    if (details.retryable && job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(dependencies.now().getTime() + retryDelay(job.attempts) * 1_000)
      await dependencies.appendEvent(job.analysisId, {
        type: "error",
        code: details.code,
        message: "Source credibility assessment was interrupted and will be retried.",
      })
      await dependencies.retryJob(job.id, job.lockToken, availableAt, details.code)
      return
    }

    await dependencies.appendEvent(job.analysisId, {
      type: "error",
      code: details.code,
      message:
        "Source credibility could not be assessed reliably; verified sources were preserved.",
    })
    if (analysisActive) {
      try {
        await advanceToAssembly(dependencies, job)
        return
      } catch (boundaryError) {
        logger.warn("source_credibility.assembly_handoff_failed", {
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

export async function processNextCredibilityJob(
  dependencies: CredibilityWorkerDependencies = defaultDependencies(),
): Promise<boolean> {
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, "S7")
  if (!job) return false
  await processClaimedCredibilityJob(job, dependencies)
  return true
}
