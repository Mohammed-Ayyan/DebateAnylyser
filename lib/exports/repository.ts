import "server-only"

import { and, desc, eq, isNull } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { analyses, dataExports, operationJobs } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import { accountDataExportJobValues, reportExportJobValues } from "./job-payload"

export type ExportRow = typeof dataExports.$inferSelect

function notFound(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: "Export not found.",
    expose: true,
  })
}

export async function createReportExport(input: {
  ownerId: string
  analysisId: string
  policyVersion: string
  disclaimerVersion: string
  limitationsUrl: string
}): Promise<ExportRow> {
  return getDatabase().transaction(async (tx) => {
    const [row] = await tx
      .insert(dataExports)
      .values({ ...input, kind: "report_html" })
      .returning()
    if (!row) throw new Error("EXPORT_INSERT_FAILED")
    await tx
      .insert(operationJobs)
      .values(reportExportJobValues(input.ownerId, input.analysisId, row.id))
    return row
  })
}
export async function createAccountDataExport(input: {
  ownerId: string
  includeTranscript: boolean
}): Promise<ExportRow> {
  return getDatabase().transaction(async (tx) => {
    const [row] = await tx
      .insert(dataExports)
      .values({ ownerId: input.ownerId, kind: "account_data_json" })
      .returning()
    if (!row) throw new Error("EXPORT_INSERT_FAILED")
    await tx
      .insert(operationJobs)
      .values(accountDataExportJobValues(input.ownerId, row.id, input.includeTranscript))
    return row
  })
}

export async function listReportExports(ownerId: string, analysisId: string): Promise<ExportRow[]> {
  return getDatabase()
    .select()
    .from(dataExports)
    .where(
      and(
        eq(dataExports.ownerId, ownerId),
        eq(dataExports.analysisId, analysisId),
        eq(dataExports.kind, "report_html"),
      ),
    )
    .orderBy(desc(dataExports.createdAt), desc(dataExports.id))
}

export async function getOwnedExport(ownerId: string, exportId: string): Promise<ExportRow> {
  const [row] = await getDatabase()
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.ownerId, ownerId)))
    .limit(1)
  if (!row) throw notFound()
  return row
}
export async function getLatestAccountExport(ownerId: string): Promise<ExportRow | undefined> {
  const [row] = await getDatabase()
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.ownerId, ownerId), eq(dataExports.kind, "account_data_json")))
    .orderBy(desc(dataExports.createdAt), desc(dataExports.id))
    .limit(1)
  return row
}

export async function getExportForWorker(exportId: string): Promise<ExportRow> {
  const [row] = await getDatabase()
    .select()
    .from(dataExports)
    .where(eq(dataExports.id, exportId))
    .limit(1)
  if (!row) throw new Error("EXPORT_NOT_FOUND")
  return row
}

export async function markExportProcessing(exportId: string): Promise<void> {
  await getDatabase()
    .update(dataExports)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(dataExports.id, exportId), eq(dataExports.status, "queued")))
}

export async function completeExportJob(input: {
  exportId: string
  jobId: string
  lockToken: string
  objectKey: string
  contentType: string
}): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const now = new Date()
    await tx
      .update(dataExports)
      .set({
        status: "complete",
        objectKey: input.objectKey,
        contentType: input.contentType,
        completedAt: now,
        errorClass: null,
        updatedAt: now,
      })
      .where(eq(dataExports.id, input.exportId))
    const [completedJob] = await tx
      .update(operationJobs)
      .set({ status: "complete", lockedAt: null, lockToken: null, updatedAt: now })
      .where(
        and(
          eq(operationJobs.id, input.jobId),
          eq(operationJobs.status, "processing"),
          eq(operationJobs.lockToken, input.lockToken),
        ),
      )
      .returning({ id: operationJobs.id })
    if (!completedJob) throw new Error("EXPORT_JOB_LEASE_LOST")
  })
}
export async function retryOrFailExportJob(input: {
  exportId: string
  jobId: string
  lockToken: string
  errorClass: string
  retryAt?: Date
}): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const now = new Date()
    const retry = input.retryAt !== undefined
    await tx
      .update(dataExports)
      .set({ status: retry ? "queued" : "failed", errorClass: input.errorClass, updatedAt: now })
      .where(eq(dataExports.id, input.exportId))
    const [updatedJob] = await tx
      .update(operationJobs)
      .set({
        status: retry ? "queued" : "failed",
        availableAt: input.retryAt ?? now,
        lastErrorClass: input.errorClass,
        lockedAt: null,
        lockToken: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(operationJobs.id, input.jobId),
          eq(operationJobs.status, "processing"),
          eq(operationJobs.lockToken, input.lockToken),
        ),
      )
      .returning({ id: operationJobs.id })
    if (!updatedJob) throw new Error("EXPORT_JOB_LEASE_LOST")
  })
}

export async function listActiveAnalysesForAccount(ownerId: string) {
  return getDatabase()
    .select()
    .from(analyses)
    .where(and(eq(analyses.ownerId, ownerId), isNull(analyses.deletedAt)))
    .orderBy(desc(analyses.createdAt), desc(analyses.id))
}
