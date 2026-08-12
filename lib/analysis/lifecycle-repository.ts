import "server-only"

import { and, desc, eq, isNull, sql } from "drizzle-orm"

import type { AnalysisStatus, PipelineStage } from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import { analyses, analysisStageRuns, retentionSchedules } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import { retentionDueAt } from "@/lib/privacy/retention"
import { assertAnalysisTransition } from "./status-lifecycle"

function transitionConflict(entity: string): AppError {
  return new AppError({
    code: "STATUS_CONFLICT",
    status: 409,
    message: `${entity} status changed before this operation completed.`,
    expose: true,
    retryable: true,
  })
}

export async function transitionAnalysisStatus(
  analysisId: string,
  expected: AnalysisStatus,
  next: AnalysisStatus,
) {
  assertAnalysisTransition(expected, next)
  return getDatabase().transaction(async (tx) => {
    const now = new Date()
    const [analysis] = await tx
      .update(analyses)
      .set({ status: next, updatedAt: now })
      .where(
        and(eq(analyses.id, analysisId), eq(analyses.status, expected), isNull(analyses.deletedAt)),
      )
      .returning()
    if (!analysis) throw transitionConflict("Analysis")
    if (next === "complete") {
      const dueAt = retentionDueAt(
        analysis.retentionSetting,
        analysis.createdAt,
        analysis.status,
        now,
      )
      if (dueAt) {
        await tx
          .insert(retentionSchedules)
          .values({
            analysisId,
            retentionSetting: analysis.retentionSetting,
            dueAt,
            status: "scheduled",
          })
          .onConflictDoUpdate({
            target: retentionSchedules.analysisId,
            set: {
              retentionSetting: analysis.retentionSetting,
              dueAt,
              status: "scheduled",
              updatedAt: now,
            },
          })
      }
    }
    return analysis
  })
}

export async function createStageAttempt(analysisId: string, stage: PipelineStage) {
  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:${stage}`}, 0))`,
    )
    const [latest] = await tx
      .select({ attempt: analysisStageRuns.attempt })
      .from(analysisStageRuns)
      .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, stage)))
      .orderBy(desc(analysisStageRuns.attempt))
      .limit(1)
    const [run] = await tx
      .insert(analysisStageRuns)
      .values({ analysisId, stage, attempt: (latest?.attempt ?? 0) + 1 })
      .returning()
    return run
  })
}
