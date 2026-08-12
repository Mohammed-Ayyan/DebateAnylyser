import "server-only"

import { createStageAttempt, transitionAnalysisStatus } from "./lifecycle-repository"
import { requireInternalAssembly } from "./public-analysis"
import {
  failRunningStageAttempts,
  getLatestStageRuns,
  transitionStageRun,
} from "./stage-run-repository"
import { nextStageAfterS8, nextStageAfterS9 } from "./stage-routing"
import type { PipelineStage } from "@/lib/contracts/analysis"
import { serverEnv } from "@/lib/env/server"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { logger } from "@/lib/observability/logger"
import {
  advanceAnalysisJobStage,
  completeAnalysisJob,
  failAnalysisJob,
  renewAnalysisJobLease,
  retryAnalysisJob,
  type ClaimedAnalysisJob,
} from "@/lib/queue/analysis-jobs"
import { getFinalizationAnalysis, getFinalizationStage } from "./finalization-repository"

export type FinalizationWorkerDependencies = {
  renewJob: typeof renewAnalysisJobLease
  advanceJob: typeof advanceAnalysisJobStage
  completeJob: typeof completeAnalysisJob
  retryJob: typeof retryAnalysisJob
  failJob: typeof failAnalysisJob
  getAnalysis: typeof getFinalizationAnalysis
  getStage: typeof getFinalizationStage
  getRuns: typeof getLatestStageRuns
  assemble: typeof requireInternalAssembly
  failRunningAttempts: typeof failRunningStageAttempts
  createAttempt: typeof createStageAttempt
  transitionStage: typeof transitionStageRun
  transitionAnalysis: typeof transitionAnalysisStatus
  appendEvent: typeof appendAnalysisEvent
  now: () => Date
}

function defaults(): FinalizationWorkerDependencies {
  return {
    renewJob: renewAnalysisJobLease,
    advanceJob: advanceAnalysisJobStage,
    completeJob: completeAnalysisJob,
    retryJob: retryAnalysisJob,
    failJob: failAnalysisJob,
    getAnalysis: getFinalizationAnalysis,
    getStage: getFinalizationStage,
    getRuns: getLatestStageRuns,
    assemble: requireInternalAssembly,
    failRunningAttempts: failRunningStageAttempts,
    createAttempt: createStageAttempt,
    transitionStage: transitionStageRun,
    transitionAnalysis: transitionAnalysisStatus,
    appendEvent: appendAnalysisEvent,
    now: () => new Date(),
  }
}
async function requireLease(result: Promise<boolean>): Promise<void> {
  if (!(await result)) throw new Error("WORKER_LEASE_LOST")
}

async function publishStage(
  deps: FinalizationWorkerDependencies,
  analysisId: string,
  stage: PipelineStage,
  status: "running" | "complete" | "failed",
  attempt: number,
  errorClass?: string,
): Promise<void> {
  await deps.appendEvent(analysisId, {
    type: "stage.status",
    stage,
    status,
    attempt,
    ...(errorClass ? { error_class: errorClass } : {}),
  })
}

async function emitAssembledOutput(
  deps: FinalizationWorkerDependencies,
  analysisId: string,
): Promise<number> {
  const assembled = await deps.assemble(analysisId)
  await deps.appendEvent(analysisId, { type: "overview.ready", overview: assembled.overview })
  if (assembled.findings.length === 0) {
    await deps.appendEvent(analysisId, { type: "finding.batch", stage: "S10", findings: [] })
  }
  for (let offset = 0; offset < assembled.findings.length; offset += 50) {
    await deps.appendEvent(analysisId, {
      type: "finding.batch",
      stage: "S10",
      findings: assembled.findings.slice(offset, offset + 50),
      structure_edges: offset === 0 ? assembled.structure_edges : undefined,
    })
  }
  return assembled.findings.length
}

function nextStage(stage: PipelineStage): PipelineStage | undefined {
  if (stage === "S8") return nextStageAfterS8()
  if (stage === "S9") return nextStageAfterS9()
  return undefined
}

function assertPrerequisites(
  stage: PipelineStage,
  runs: Awaited<ReturnType<typeof getLatestStageRuns>>,
) {
  if (stage === "S8") {
    if (
      runs.some(
        (run) => Number(run.stage.slice(1)) < 8 && ["pending", "running"].includes(run.status),
      )
    ) {
      throw new Error("FINALIZATION_PREREQUISITES_RUNNING")
    }
    return
  }
  const required = stage === "S9" ? "S8" : "S9"
  if (!runs.some((run) => run.stage === required && run.status === "complete")) {
    throw new Error(`FINALIZATION_${required}_REQUIRED`)
  }
}
export async function processClaimedFinalizationJob(
  job: ClaimedAnalysisJob,
  deps: FinalizationWorkerDependencies = defaults(),
): Promise<void> {
  if (!["S8", "S9", "S10"].includes(job.stage)) {
    throw new Error(`Finalization worker cannot process ${job.stage}`)
  }
  let leaseLost = false
  const heartbeat = setInterval(
    () => {
      void deps.renewJob(job.id, job.lockToken).then((renewed) => {
        leaseLost = !renewed
      })
    },
    Math.max(10_000, Math.floor((serverEnv.WORKER_JOB_LEASE_SECONDS * 1_000) / 3)),
  )
  heartbeat.unref?.()

  let run: Awaited<ReturnType<typeof createStageAttempt>> | undefined
  try {
    const analysis = await deps.getAnalysis(job.analysisId)
    if (!analysis) throw new Error("FINALIZATION_ANALYSIS_NOT_FOUND")
    if (analysis.status === "partial") {
      await deps.transitionAnalysis(job.analysisId, "partial", "analyzing")
    }
    const runs = await deps.getRuns(job.analysisId)
    assertPrerequisites(job.stage, runs)
    const snapshot = await deps.getStage(job.analysisId, job.stage)
    if (snapshot?.status === "complete") {
      await requireLease(deps.renewJob(job.id, job.lockToken))
      const next = nextStage(job.stage)
      if (next) {
        await requireLease(deps.advanceJob(job.id, job.lockToken, job.stage, next))
      } else {
        await emitAssembledOutput(deps, job.analysisId)
        await deps.appendEvent(job.analysisId, {
          type: "analysis.done",
          status: analysis.status === "complete" ? "complete" : "partial",
        })
        await requireLease(deps.completeJob(job.id, job.lockToken))
      }
      return
    }

    await deps.failRunningAttempts(job.analysisId, job.stage)
    run = await deps.createAttempt(job.analysisId, job.stage)
    await deps.transitionStage(run.id, "pending", "running")
    await publishStage(deps, job.analysisId, job.stage, "running", run.attempt)
    await deps.assemble(job.analysisId)
    await requireLease(deps.renewJob(job.id, job.lockToken))
    await deps.transitionStage(run.id, "running", "complete")
    await publishStage(deps, job.analysisId, job.stage, "complete", run.attempt)
    const next = nextStage(job.stage)
    if (next) {
      await requireLease(deps.advanceJob(job.id, job.lockToken, job.stage, next))
      return
    }

    const findingCount = await emitAssembledOutput(deps, job.analysisId)
    const finalRuns = await deps.getRuns(job.analysisId)
    const outcome = finalRuns.some((item) => item.status === "failed")
      ? findingCount > 0
        ? "partial"
        : "failed"
      : "complete"
    await deps.transitionAnalysis(job.analysisId, "analyzing", outcome)
    await deps.appendEvent(job.analysisId, { type: "analysis.done", status: outcome })
    await requireLease(deps.completeJob(job.id, job.lockToken))
  } catch (error) {
    const errorClass = error instanceof Error ? error.message : "FINALIZATION_INTERNAL_ERROR"
    logger.error("analysis_finalization.job_failed", {
      analysisId: job.analysisId,
      jobId: job.id,
      stage: job.stage,
      errorClass,
      error,
    })
    if (leaseLost || errorClass === "WORKER_LEASE_LOST") return
    if (run) {
      try {
        await deps.transitionStage(run.id, "running", "failed", errorClass)
        await publishStage(deps, job.analysisId, job.stage, "failed", run.attempt, errorClass)
      } catch (stageError) {
        logger.warn("analysis_finalization.stage_failure_record_failed", { error: stageError })
      }
    }
    if (job.attempts < serverEnv.WORKER_MAX_ATTEMPTS) {
      const availableAt = new Date(deps.now().getTime() + 30_000 * 2 ** (job.attempts - 1))
      await deps.retryJob(job.id, job.lockToken, availableAt, errorClass)
      return
    }
    const analysis = await deps.getAnalysis(job.analysisId)
    if (analysis?.status === "analyzing") {
      await deps.transitionAnalysis(job.analysisId, "analyzing", "partial")
      await deps.appendEvent(job.analysisId, { type: "analysis.done", status: "partial" })
    }
    await deps.failJob(job.id, job.lockToken, errorClass)
  } finally {
    clearInterval(heartbeat)
  }
}
