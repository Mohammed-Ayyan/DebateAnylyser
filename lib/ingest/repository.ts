import "server-only"

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisInputs,
  analysisJobs,
  idempotencyRecords,
  retentionSchedules,
  uploads,
} from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import { retentionDueAt } from "@/lib/privacy/retention"
import type { AnalysisSubmission } from "./contracts"
import { resolveIdempotentReplay } from "./idempotency"

export type UploadReservationInput = {
  ownerId: string
  mediaKey: string
  filename: string
  contentType: string
  size: number
  expiresAt: Date
}

export type AvailableUpload = typeof uploads.$inferSelect
export type AnalysisCreatedResponse = { id: string; status: "queued" }
export type CreateAnalysisResult = AnalysisCreatedResponse & { replayed: boolean }

export type CreateAnalysisTransactionInput = {
  ownerId: string
  submission: AnalysisSubmission
  upload?: AvailableUpload
  title: string
  requestHash: string
  idempotencyKeyHash?: string
  idempotencyExpiresAt?: Date
}

export async function createUploadReservation(input: UploadReservationInput) {
  const [reservation] = await getDatabase().insert(uploads).values(input).returning()
  return reservation
}

export async function deleteUploadReservation(id: string): Promise<void> {
  await getDatabase()
    .delete(uploads)
    .where(and(eq(uploads.id, id), isNull(uploads.claimedAt)))
}

export async function findAvailableUpload(
  ownerId: string,
  mediaKey: string,
  now = new Date(),
): Promise<AvailableUpload | undefined> {
  const [upload] = await getDatabase()
    .select()
    .from(uploads)
    .where(
      and(
        eq(uploads.ownerId, ownerId),
        eq(uploads.mediaKey, mediaKey),
        isNull(uploads.claimedAt),
        gt(uploads.expiresAt, now),
      ),
    )
    .limit(1)
  return upload
}

export async function findAnalysisReplay(
  ownerId: string,
  keyHash: string,
  requestHash: string,
  now = new Date(),
): Promise<CreateAnalysisResult | undefined> {
  const [existing] = await getDatabase()
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.ownerId, ownerId),
        eq(idempotencyRecords.scope, "analyses.create"),
        eq(idempotencyRecords.keyHash, keyHash),
        gt(idempotencyRecords.expiresAt, now),
      ),
    )
    .limit(1)
  const replay = resolveIdempotentReplay(existing, requestHash)
  return replay ? { ...replay, replayed: true } : undefined
}

export async function createAnalysisTransaction(
  input: CreateAnalysisTransactionInput,
): Promise<CreateAnalysisResult> {
  return getDatabase().transaction(async (tx) => {
    const now = new Date()
    if (input.idempotencyKeyHash) {
      const lockValue = `${input.ownerId}:analyses:${input.idempotencyKeyHash}`
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockValue}, 0))`)
      await tx
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.ownerId, input.ownerId),
            eq(idempotencyRecords.scope, "analyses.create"),
            eq(idempotencyRecords.keyHash, input.idempotencyKeyHash),
            lte(idempotencyRecords.expiresAt, now),
          ),
        )
      const [existing] = await tx
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.ownerId, input.ownerId),
            eq(idempotencyRecords.scope, "analyses.create"),
            eq(idempotencyRecords.keyHash, input.idempotencyKeyHash),
            gt(idempotencyRecords.expiresAt, now),
          ),
        )
        .limit(1)
      const replay = resolveIdempotentReplay(existing, input.requestHash)
      if (replay) return { ...replay, replayed: true }
    }

    const [analysis] = await tx
      .insert(analyses)
      .values({
        ownerId: input.ownerId,
        sourceType: input.submission.source_type,
        sourceMediaKey:
          input.submission.source_type === "upload" ? input.submission.media_key : null,
        sourceUrl: input.submission.source_type === "url" ? input.submission.url : null,
        sourceRetrievalMethod:
          input.submission.source_type === "url" ? input.submission.retrieval_method : null,
        title: input.title,
        status: "queued",
        rightsCheckResult: "passed",
        rightsBlockReason: null,
        retentionSetting: input.submission.retention_setting,
      })
      .returning({ id: analyses.id, status: analyses.status, createdAt: analyses.createdAt })

    const retentionDue = retentionDueAt(
      input.submission.retention_setting,
      analysis.createdAt,
      analysis.status,
      now,
    )
    if (retentionDue) {
      await tx.insert(retentionSchedules).values({
        analysisId: analysis.id,
        retentionSetting: input.submission.retention_setting,
        dueAt: retentionDue,
      })
    }

    if (input.submission.source_type === "upload") {
      if (!input.upload) {
        throw new AppError({
          code: "UPLOAD_INVALID",
          status: 422,
          message: "The upload reservation is unavailable.",
          expose: true,
        })
      }
      const [claimed] = await tx
        .update(uploads)
        .set({ claimedAt: now })
        .where(
          and(
            eq(uploads.id, input.upload.id),
            eq(uploads.ownerId, input.ownerId),
            isNull(uploads.claimedAt),
            gt(uploads.expiresAt, now),
          ),
        )
        .returning({ id: uploads.id })
      if (!claimed) {
        throw new AppError({
          code: "UPLOAD_INVALID",
          status: 422,
          message: "The upload reservation expired or was already used.",
          expose: true,
        })
      }
    }

    if (input.submission.source_type === "paste") {
      await tx
        .insert(analysisInputs)
        .values({ analysisId: analysis.id, pasteText: input.submission.paste_text })
    }
    await tx.insert(analysisJobs).values({ analysisId: analysis.id })
    const response: AnalysisCreatedResponse = { id: analysis.id, status: "queued" }

    if (input.idempotencyKeyHash && input.idempotencyExpiresAt) {
      await tx.insert(idempotencyRecords).values({
        ownerId: input.ownerId,
        scope: "analyses.create",
        keyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        responseStatus: 201,
        responseBody: response,
        expiresAt: input.idempotencyExpiresAt,
      })
    }
    return { ...response, replayed: false }
  })
}
