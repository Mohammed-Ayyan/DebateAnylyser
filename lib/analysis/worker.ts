import "server-only"

import { processClaimedClaimJob } from "@/lib/claims/worker"
import { CLAIM_DEPENDENT_STAGES, markStagesSkipped } from "@/lib/analysis/skipped-stages"
import { processClaimedCredibilityJob } from "@/lib/credibility/worker"
import type { PipelineStage } from "@/lib/contracts/analysis"
import { serverEnv } from "@/lib/env/server"
import { processClaimedEvidenceJob } from "@/lib/evidence/worker"
import { processClaimedFinalizationJob } from "@/lib/analysis/finalization-worker"
import { processClaimedFallacyJob } from "@/lib/fallacy/worker"
import { logger } from "@/lib/observability/logger"
import { pipelineLog } from "@/lib/observability/pipeline-logger"
import {
  advanceAnalysisJobStage,
  claimAnalysisJob,
  failAnalysisJob,
  retryAnalysisJob,
  type ClaimedAnalysisJob,
} from "@/lib/queue/analysis-jobs"
import { processClaimedSupportJob } from "@/lib/support/worker"
import { processClaimedStructureJob } from "@/lib/structure/worker"
import { processClaimedTranscriptionJob } from "@/lib/transcription/worker"

async function rerouteDisabledClaimStage(job: ClaimedAnalysisJob): Promise<void> {
  try {
    await markStagesSkipped(job.analysisId, CLAIM_DEPENDENT_STAGES)
    const advanced = await advanceAnalysisJobStage(job.id, job.lockToken, "S2", "S8")
    if (!advanced) {
      logger.warn("analysis_worker.disabled_stage_lease_lost", {
        jobId: job.id,
        analysisId: job.analysisId,
      })
    }
  } catch (error) {
    logger.error("analysis_worker.disabled_stage_reroute_failed", {
      jobId: job.id,
      analysisId: job.analysisId,
      error,
    })
    await retryAnalysisJob(
      job.id,
      job.lockToken,
      new Date(Date.now() + 30_000),
      "DISABLED_STAGE_REROUTE_FAILED",
    )
  }
}

export async function processNextAnalysisJob(): Promise<boolean> {
  const allowedStages: PipelineStage[] = ["S1", "S2"]
  if (serverEnv.SUPPORT_ASSESSMENT_ENABLED) allowedStages.push("S3")
  if (serverEnv.SUPPORT_ASSESSMENT_ENABLED && serverEnv.ARGUMENT_STRUCTURE_ENABLED) {
    allowedStages.push("S4")
    if (serverEnv.FALLACY_DETECTION_ENABLED) allowedStages.push("S5")
  }
  if (serverEnv.EVIDENCE_RETRIEVAL_ENABLED) {
    allowedStages.push("S6")
    if (serverEnv.SOURCE_CREDIBILITY_ENABLED) allowedStages.push("S7")
  }
  allowedStages.push("S8", "S9", "S10")
  const job = await claimAnalysisJob(serverEnv.WORKER_JOB_LEASE_SECONDS, allowedStages)
  if (!job) return false
  pipelineLog("WORKER", "START", "Job claimed", {
    analysisId: job.analysisId,
    stage: job.stage,
    attempt: job.attempts,
  })
  if (job.stage === "S1") {
    await processClaimedTranscriptionJob(job)
    pipelineLog("WORKER", "COMPLETE", "Stage dispatched and returned", {
      analysisId: job.analysisId,
      stage: "S1",
    })
    return true
  }
  if (job.stage === "S2") {
    if (serverEnv.CLAIM_EXTRACTION_ENABLED) await processClaimedClaimJob(job)
    else await rerouteDisabledClaimStage(job)
    pipelineLog("WORKER", "COMPLETE", "Stage dispatched and returned", {
      analysisId: job.analysisId,
      stage: "S2",
    })
    return true
  }
  if (job.stage === "S3") {
    await processClaimedSupportJob(job)
    pipelineLog("WORKER", "COMPLETE", "Stage dispatched and returned", {
      analysisId: job.analysisId,
      stage: "S3",
    })
    return true
  }
  if (job.stage === "S4") {
    await processClaimedStructureJob(job)
    pipelineLog("WORKER", "COMPLETE", "Stage dispatched and returned", {
      analysisId: job.analysisId,
      stage: "S4",
    })
    return true
  }
  if (job.stage === "S5") {
    await processClaimedFallacyJob(job)
    pipelineLog("WORKER", "COMPLETE", "Stage dispatched and returned", {
      analysisId: job.analysisId,
      stage: "S5",
    })
    return true
  }
  if (job.stage === "S6") {
    await processClaimedEvidenceJob(job)
    return true
  }
  if (job.stage === "S7") {
    await processClaimedCredibilityJob(job)
    return true
  }
  if (job.stage === "S8" || job.stage === "S9" || job.stage === "S10") {
    if (job.stage === "S8") {
      const disabledStages: PipelineStage[] = []
      if (!serverEnv.CLAIM_EXTRACTION_ENABLED) {
        disabledStages.push(...CLAIM_DEPENDENT_STAGES)
      } else {
        if (!serverEnv.SUPPORT_ASSESSMENT_ENABLED) disabledStages.push("S3")
        if (!serverEnv.SUPPORT_ASSESSMENT_ENABLED || !serverEnv.ARGUMENT_STRUCTURE_ENABLED) {
          disabledStages.push("S4")
        }
        if (
          !serverEnv.SUPPORT_ASSESSMENT_ENABLED ||
          !serverEnv.ARGUMENT_STRUCTURE_ENABLED ||
          !serverEnv.FALLACY_DETECTION_ENABLED
        ) {
          disabledStages.push("S5")
        }
        if (!serverEnv.EVIDENCE_RETRIEVAL_ENABLED) disabledStages.push("S6")
        if (!serverEnv.EVIDENCE_RETRIEVAL_ENABLED || !serverEnv.SOURCE_CREDIBILITY_ENABLED) {
          disabledStages.push("S7")
        }
      }
      try {
        await markStagesSkipped(job.analysisId, disabledStages)
      } catch (error) {
        logger.error("analysis_worker.disabled_stage_persistence_failed", {
          jobId: job.id,
          analysisId: job.analysisId,
          error,
        })
        await retryAnalysisJob(
          job.id,
          job.lockToken,
          new Date(Date.now() + 30_000),
          "DISABLED_STAGE_PERSISTENCE_FAILED",
        )
        return true
      }
    }
    await processClaimedFinalizationJob(job)
    return true
  }
  logger.error("analysis_worker.unsupported_stage", {
    jobId: job.id,
    analysisId: job.analysisId,
    stage: job.stage,
  })
  await failAnalysisJob(job.id, job.lockToken, "UNSUPPORTED_JOB_STAGE")
  return true
}

export async function runAnalysisWorker(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    const processed = await processNextAnalysisJob()
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
