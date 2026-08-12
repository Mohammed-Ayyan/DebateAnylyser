import "server-only"

import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisJobs,
  dataEvents,
  dataExports,
  operationJobs,
  retentionSchedules,
  shares,
  users,
} from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import { accountCleanupDedupeKey, analysisCleanupDedupeKey } from "./deletion-plan"

export type DeletionReason = "manual" | "retention" | "account"

function notFound(entity: "Analysis" | "Account"): AppError {
  return new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: `${entity} not found.`,
    expose: true,
  })
}

export async function requestAnalysisDeletion(
  ownerId: string,
  analysisId: string,
  reason: DeletionReason,
  now = new Date(),
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const locked = await tx.execute(sql`
      select id from analyses
      where id = ${analysisId}::uuid and owner_id = ${ownerId}::uuid and deleted_at is null
      for update
    `)
    if (locked.length === 0) throw notFound("Analysis")

    await tx
      .update(analyses)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(analyses.id, analysisId))
    await tx
      .update(shares)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(and(eq(shares.analysisId, analysisId), eq(shares.status, "active")))
    await tx
      .update(analysisJobs)
      .set({
        status: "failed",
        lastErrorClass: "ANALYSIS_DELETED",
        lockedAt: null,
        lockToken: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(analysisJobs.analysisId, analysisId),
          inArray(analysisJobs.status, ["queued", "processing"]),
        ),
      )
    await tx
      .update(operationJobs)
      .set({ status: "cancelled", lockedAt: null, lockToken: null, updatedAt: now })
      .where(
        and(
          eq(operationJobs.analysisId, analysisId),
          ne(operationJobs.type, "analysis_cleanup"),
          inArray(operationJobs.status, ["queued", "processing"]),
        ),
      )
    await tx
      .update(retentionSchedules)
      .set({ status: reason === "retention" ? "complete" : "cancelled", updatedAt: now })
      .where(eq(retentionSchedules.analysisId, analysisId))
    await tx
      .insert(operationJobs)
      .values({
        type: "analysis_cleanup",
        ownerId,
        analysisId,
        dedupeKey: analysisCleanupDedupeKey(analysisId),
        payload: { analysis_id: analysisId },
      })
      .onConflictDoNothing({ target: operationJobs.dedupeKey })
    await tx.insert(dataEvents).values({
      ownerId,
      analysisId,
      eventType: "analysis_deletion_requested",
      payload: { reason },
      createdAt: now,
    })
  })
}

export async function requestAccountDeletion(ownerId: string, now = new Date()): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const locked = await tx.execute(sql`
      select id from users where id = ${ownerId}::uuid and deleted_at is null for update
    `)
    if (locked.length === 0) throw notFound("Account")

    await tx.update(users).set({ deletedAt: now, updatedAt: now }).where(eq(users.id, ownerId))
    const tombstoned = await tx
      .update(analyses)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(analyses.ownerId, ownerId), isNull(analyses.deletedAt)))
      .returning({ id: analyses.id })
    const analysisIds = tombstoned.map(({ id }) => id)

    if (analysisIds.length > 0) {
      await tx
        .update(shares)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(and(inArray(shares.analysisId, analysisIds), eq(shares.status, "active")))
      await tx
        .update(analysisJobs)
        .set({
          status: "failed",
          lastErrorClass: "ACCOUNT_DELETED",
          lockedAt: null,
          lockToken: null,
          updatedAt: now,
        })
        .where(
          and(
            inArray(analysisJobs.analysisId, analysisIds),
            inArray(analysisJobs.status, ["queued", "processing"]),
          ),
        )
      await tx
        .update(retentionSchedules)
        .set({ status: "cancelled", updatedAt: now })
        .where(inArray(retentionSchedules.analysisId, analysisIds))
    }
    await tx
      .update(operationJobs)
      .set({ status: "cancelled", lockedAt: null, lockToken: null, updatedAt: now })
      .where(
        and(
          eq(operationJobs.ownerId, ownerId),
          inArray(operationJobs.status, ["queued", "processing"]),
          ne(operationJobs.type, "analysis_cleanup"),
          ne(operationJobs.type, "account_cleanup"),
        ),
      )
    for (const { id } of tombstoned) {
      await tx
        .insert(operationJobs)
        .values({
          type: "analysis_cleanup",
          ownerId,
          analysisId: id,
          dedupeKey: analysisCleanupDedupeKey(id),
          payload: { analysis_id: id },
        })
        .onConflictDoNothing({ target: operationJobs.dedupeKey })
    }
    await tx
      .insert(operationJobs)
      .values({
        type: "account_cleanup",
        ownerId,
        dedupeKey: accountCleanupDedupeKey(ownerId),
        payload: { owner_id: ownerId },
      })
      .onConflictDoNothing({ target: operationJobs.dedupeKey })
    await tx.insert(dataEvents).values({
      ownerId,
      eventType: "account_deletion_requested",
      payload: { analysis_count: analysisIds.length },
      createdAt: now,
    })
  })
}

export async function getAnalysisCleanupArtifacts(analysisId: string): Promise<string[]> {
  const [analysis] = await getDatabase()
    .select({ sourceMediaKey: analyses.sourceMediaKey })
    .from(analyses)
    .where(and(eq(analyses.id, analysisId), isNotNull(analyses.deletedAt)))
    .limit(1)
  if (!analysis) return []
  const exportRows = await getDatabase()
    .select({ objectKey: dataExports.objectKey })
    .from(dataExports)
    .where(and(eq(dataExports.analysisId, analysisId), isNotNull(dataExports.objectKey)))
  return [analysis.sourceMediaKey, ...exportRows.map(({ objectKey }) => objectKey)].filter(
    (key): key is string => key !== null,
  )
}

export async function hardDeleteAnalysis(analysisId: string, now = new Date()): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const [analysis] = await tx
      .select({ ownerId: analyses.ownerId })
      .from(analyses)
      .where(and(eq(analyses.id, analysisId), isNotNull(analyses.deletedAt)))
      .limit(1)
    if (!analysis) return
    await tx.insert(dataEvents).values({
      ownerId: analysis.ownerId,
      analysisId,
      eventType: "analysis_deleted",
      payload: {},
      createdAt: now,
    })
    await tx.delete(analyses).where(eq(analyses.id, analysisId))
  })
}

export async function getAccountCleanupState(
  ownerId: string,
): Promise<{ remainingAnalyses: number; objectKeys: string[] } | undefined> {
  const [owner] = await getDatabase()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerId), isNotNull(users.deletedAt)))
    .limit(1)
  if (!owner) return undefined
  const [{ count }] = await getDatabase()
    .select({ count: sql<number>`count(*)::int` })
    .from(analyses)
    .where(eq(analyses.ownerId, ownerId))
  const exportsForOwner = await getDatabase()
    .select({ objectKey: dataExports.objectKey })
    .from(dataExports)
    .where(and(eq(dataExports.ownerId, ownerId), isNotNull(dataExports.objectKey)))
  return {
    remainingAnalyses: count,
    objectKeys: exportsForOwner
      .map(({ objectKey }) => objectKey)
      .filter((key): key is string => key !== null),
  }
}

export async function hardDeleteAccount(ownerId: string, now = new Date()): Promise<boolean> {
  return getDatabase().transaction(async (tx) => {
    const remaining = await tx
      .select({ id: analyses.id })
      .from(analyses)
      .where(eq(analyses.ownerId, ownerId))
      .limit(1)
    if (remaining.length > 0) return false
    await tx.insert(dataEvents).values({
      ownerId,
      eventType: "account_deleted",
      payload: {},
      createdAt: now,
    })
    const deleted = await tx
      .delete(users)
      .where(and(eq(users.id, ownerId), isNotNull(users.deletedAt)))
      .returning({ id: users.id })
    return deleted.length === 1
  })
}
