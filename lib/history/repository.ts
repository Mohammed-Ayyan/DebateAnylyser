import "server-only"

import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm"

import type { AnalysisStatus, PipelineStage } from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisJobs,
  analysisStageRuns,
  dataEvents,
  idempotencyRecords,
  retentionSchedules,
} from "@/lib/db/schema"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { hashIdempotencyKey } from "@/lib/ingest/contracts"
import { retentionDueAt } from "@/lib/privacy/retention"
import type { HistoryListItem, HistoryListQuery, HistoryPatchBody } from "./contracts"
import type { HistoryCursor } from "./cursor"
import { earliestResumableStage } from "./resume"

export type HistoryPage = { items: HistoryListItem[]; hasMore: boolean }

export async function listHistoryRows(
  ownerId: string,
  query: HistoryListQuery,
  cursor?: HistoryCursor,
): Promise<HistoryPage> {
  const filters = [eq(analyses.ownerId, ownerId), isNull(analyses.deletedAt)]
  if (query.status) filters.push(eq(analyses.status, query.status))
  if (query.query) {
    filters.push(sql`position(lower(${query.query}) in lower(${analyses.title})) > 0`)
  }
  if (cursor) {
    const createdAt = new Date(cursor.created_at)
    filters.push(
      or(
        lt(analyses.createdAt, createdAt),
        and(eq(analyses.createdAt, createdAt), lt(analyses.id, cursor.id)),
      )!,
    )
  }
  const rows = await getDatabase()
    .select()
    .from(analyses)
    .where(and(...filters))
    .orderBy(desc(analyses.createdAt), desc(analyses.id))
    .limit(query.limit + 1)
  return {
    items: rows.slice(0, query.limit).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      source_type: row.sourceType,
      retention_setting: row.retentionSetting,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })),
    hasMore: rows.length > query.limit,
  }
}

function missingAnalysis(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: "Analysis not found.",
    expose: true,
  })
}

export async function patchHistoryAnalysis(
  ownerId: string,
  analysisId: string,
  patch: HistoryPatchBody,
): Promise<HistoryListItem> {
  return getDatabase().transaction(async (tx) => {
    const locked = await tx.execute(sql`
      select * from analyses where id = ${analysisId}::uuid and owner_id = ${ownerId}::uuid
        and deleted_at is null for update
    `)
    if (locked.length === 0) throw missingAnalysis()
    const now = new Date()
    const [updated] = await tx
      .update(analyses)
      .set({
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.retention_setting === undefined
          ? {}
          : { retentionSetting: patch.retention_setting }),
        updatedAt: now,
      })
      .where(eq(analyses.id, analysisId))
      .returning()
    if (patch.retention_setting !== undefined) {
      const dueAt = retentionDueAt(patch.retention_setting, updated.createdAt, updated.status, now)
      if (dueAt) {
        await tx
          .insert(retentionSchedules)
          .values({
            analysisId,
            retentionSetting: patch.retention_setting,
            dueAt,
            status: "scheduled",
          })
          .onConflictDoUpdate({
            target: retentionSchedules.analysisId,
            set: {
              retentionSetting: patch.retention_setting,
              dueAt,
              status: "scheduled",
              updatedAt: now,
            },
          })
      } else {
        await tx.delete(retentionSchedules).where(eq(retentionSchedules.analysisId, analysisId))
      }
      await tx.insert(dataEvents).values({
        ownerId,
        analysisId,
        eventType: "retention_updated",
        payload: { retention_setting: patch.retention_setting },
        createdAt: now,
      })
    }
    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      source_type: updated.sourceType,
      retention_setting: updated.retentionSetting,
      created_at: updated.createdAt.toISOString(),
      updated_at: updated.updatedAt.toISOString(),
    }
  })
}

function resumeConflict(): AppError {
  return new AppError({
    code: "RESUME_CONFLICT",
    status: 409,
    message: "Only partial or failed analyses can be resumed.",
    expose: true,
  })
}

export async function resumeHistoryAnalysis(
  ownerId: string,
  analysisId: string,
  idempotencyKey: string,
): Promise<{ status: AnalysisStatus; replayed: boolean }> {
  return getDatabase().transaction(async (tx) => {
    const now = new Date()
    const keyHash = hashIdempotencyKey(idempotencyKey)
    const scope = `analyses.resume:${analysisId}`
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${ownerId}:${scope}:${keyHash}`}, 0))`,
    )
    const [replay] = await tx
      .select({ responseBody: idempotencyRecords.responseBody })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.ownerId, ownerId),
          eq(idempotencyRecords.scope, scope),
          eq(idempotencyRecords.keyHash, keyHash),
          gt(idempotencyRecords.expiresAt, now),
        ),
      )
      .limit(1)
    if (replay) {
      const status = replay.responseBody.status
      if (status === "queued" || status === "analyzing") return { status, replayed: true }
    }

    const locked = await tx.execute(sql`
      select status from analyses where id = ${analysisId}::uuid and owner_id = ${ownerId}::uuid
        and deleted_at is null for update
    `)
    const analysis = locked[0] as { status: AnalysisStatus } | undefined
    if (!analysis) throw missingAnalysis()
    if (analysis.status !== "partial" && analysis.status !== "failed") throw resumeConflict()

    const runs = await tx
      .select({ stage: analysisStageRuns.stage, status: analysisStageRuns.status })
      .from(analysisStageRuns)
      .where(eq(analysisStageRuns.analysisId, analysisId))
      .orderBy(desc(analysisStageRuns.attempt))
    const latest = new Map<PipelineStage, (typeof runs)[number]["status"]>()
    for (const run of runs) if (!latest.has(run.stage)) latest.set(run.stage, run.status)
    const resumeStage = earliestResumableStage(latest)
    const resumedStatus: AnalysisStatus = resumeStage === "S1" ? "queued" : "analyzing"

    await tx
      .update(analyses)
      .set({ status: resumedStatus, updatedAt: now })
      .where(eq(analyses.id, analysisId))
    await tx
      .insert(analysisJobs)
      .values({ analysisId, status: "queued", stage: resumeStage, availableAt: now })
      .onConflictDoUpdate({
        target: analysisJobs.analysisId,
        set: {
          status: "queued",
          stage: resumeStage,
          attempts: 0,
          availableAt: now,
          lockedAt: null,
          lockToken: null,
          lastErrorClass: null,
          updatedAt: now,
        },
      })
    const responseBody = { status: resumedStatus }
    await tx
      .insert(idempotencyRecords)
      .values({
        ownerId,
        scope,
        keyHash,
        requestHash: analysisId,
        responseStatus: 200,
        responseBody,
        expiresAt: new Date(now.getTime() + serverEnv.IDEMPOTENCY_TTL_SECONDS * 1_000),
      })
      .onConflictDoUpdate({
        target: [idempotencyRecords.ownerId, idempotencyRecords.scope, idempotencyRecords.keyHash],
        set: {
          requestHash: analysisId,
          responseStatus: 200,
          responseBody,
          expiresAt: new Date(now.getTime() + serverEnv.IDEMPOTENCY_TTL_SECONDS * 1_000),
        },
      })
    return { ...responseBody, replayed: false }
  })
}
