import "server-only"

import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import {
  accountDataExportJobPayloadSchema,
  publicExportErrorClass,
  reportExportJobPayloadSchema,
} from "@/lib/exports/job-payload"
import { completeExportJob, retryOrFailExportJob } from "@/lib/exports/repository"
import { renderAccountDataExport, renderReportExport } from "@/lib/exports/worker"
import { logger } from "@/lib/observability/logger"
import { cleanupAccount, cleanupAnalysis } from "@/lib/privacy/service"
import { requestAnalysisDeletion } from "@/lib/privacy/repository"
import {
  claimDueRetentionSchedule,
  claimOperationJob,
  completeOperationJob,
  failOperationJob,
  releaseRetentionSchedule,
  retryOperationJob,
} from "./repository"

export async function processNextOperationJob(): Promise<boolean> {
  const due = await claimDueRetentionSchedule()
  if (due) {
    try {
      await requestAnalysisDeletion(due.ownerId, due.analysisId, "retention")
    } catch (error) {
      if (error instanceof AppError && error.status === 404) return true
      await releaseRetentionSchedule(due.analysisId)
      throw error
    }
    return true
  }

  const job = await claimOperationJob(serverEnv.WORKER_JOB_LEASE_SECONDS)
  if (!job) return false
  try {
    if (job.type === "analysis_cleanup") {
      if (!job.analysisId) throw new Error("ANALYSIS_CLEANUP_SUBJECT_MISSING")
      await cleanupAnalysis(job.analysisId)
    } else if (job.type === "account_cleanup") {
      if (!job.ownerId) throw new Error("ACCOUNT_CLEANUP_SUBJECT_MISSING")
      const complete = await cleanupAccount(job.ownerId)
      if (!complete) {
        await retryOperationJob(
          job.id,
          job.lockToken,
          new Date(Date.now() + 5_000),
          "ANALYSES_REMAIN",
        )
        return true
      }
    } else if (job.type === "report_export") {
      const payload = reportExportJobPayloadSchema.parse(job.payload)
      const artifact = await renderReportExport(payload.export_id)
      await completeExportJob({
        exportId: payload.export_id,
        jobId: job.id,
        lockToken: job.lockToken,
        ...artifact,
      })
      return true
    } else {
      const payload = accountDataExportJobPayloadSchema.parse(job.payload)
      const artifact = await renderAccountDataExport(payload.export_id, payload.include_transcript)
      await completeExportJob({
        exportId: payload.export_id,
        jobId: job.id,
        lockToken: job.lockToken,
        ...artifact,
      })
      return true
    }
    await completeOperationJob(job.id, job.lockToken)
  } catch (error) {
    const errorClass = publicExportErrorClass(error)
    logger.error("m10_operation.failed", { jobId: job.id, type: job.type, errorClass, error })
    const retryAt =
      job.attempts < serverEnv.WORKER_MAX_ATTEMPTS
        ? new Date(Date.now() + 30_000 * 2 ** Math.max(0, job.attempts - 1))
        : undefined
    if (job.type === "report_export" || job.type === "account_data_export") {
      const payload =
        job.type === "report_export"
          ? reportExportJobPayloadSchema.safeParse(job.payload)
          : accountDataExportJobPayloadSchema.safeParse(job.payload)
      if (payload.success) {
        await retryOrFailExportJob({
          exportId: payload.data.export_id,
          jobId: job.id,
          lockToken: job.lockToken,
          errorClass,
          retryAt,
        })
      } else {
        await failOperationJob(job.id, job.lockToken, "INVALID_EXPORT_JOB_PAYLOAD")
      }
    } else if (retryAt) {
      await retryOperationJob(job.id, job.lockToken, retryAt, errorClass)
    } else {
      await failOperationJob(job.id, job.lockToken, errorClass)
    }
  }
  return true
}

export async function runOperationWorker(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    if (await processNextOperationJob()) continue
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
