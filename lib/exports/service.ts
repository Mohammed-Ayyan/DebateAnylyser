import "server-only"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { AppError } from "@/lib/errors/app-error"
import {
  requireAccountDataExportEnabled,
  requireReportExportPublication,
} from "@/lib/legal/publication-policy"
import { serverEnv } from "@/lib/env/server"
import { S3ObjectStorage } from "@/lib/storage/s3-storage"
import {
  createAccountDataExport,
  createReportExport,
  getLatestAccountExport,
  getOwnedExport,
  listReportExports,
} from "./repository"
import { toExportResource } from "./contracts"

function requireAssembled(state: Awaited<ReturnType<typeof loadPublicAnalysisState>>): void {
  if (!state.assembled) {
    throw new AppError({
      code: "ANALYSIS_NOT_READY",
      status: 409,
      message: "The post-S9 analysis is not ready for publication.",
      expose: true,
    })
  }
}

export async function requestReportExport(ownerId: string, analysisId: string) {
  const policy = requireReportExportPublication()
  requireAssembled(await loadPublicAnalysisState(analysisId, { requireS9: true }))
  return toExportResource(
    await createReportExport({
      ownerId,
      analysisId,
      policyVersion: policy.policyVersion,
      disclaimerVersion: policy.disclaimerVersion,
      limitationsUrl: policy.limitationsUrl,
    }),
  )
}
export async function getReportExports(ownerId: string, analysisId: string) {
  requireReportExportPublication()
  return (await listReportExports(ownerId, analysisId)).map(toExportResource)
}

async function withDownload(row: Awaited<ReturnType<typeof getOwnedExport>>) {
  const resource = toExportResource(row)
  if (row.status !== "complete" || !row.objectKey) return resource
  const expiresAt = new Date(Date.now() + serverEnv.OBJECT_DOWNLOAD_URL_TTL_SECONDS * 1_000)
  return {
    ...resource,
    download_url: await new S3ObjectStorage().createPresignedDownload(
      row.objectKey,
      serverEnv.OBJECT_DOWNLOAD_URL_TTL_SECONDS,
    ),
    download_expires_at: expiresAt.toISOString(),
  }
}

export async function getReportExport(ownerId: string, analysisId: string, exportId: string) {
  requireReportExportPublication()
  const row = await getOwnedExport(ownerId, exportId)
  if (row.analysisId !== analysisId || row.kind !== "report_html") {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Export not found.",
      expose: true,
    })
  }
  return withDownload(row)
}

export async function requestAccountDataExport(ownerId: string, includeTranscript: boolean) {
  requireAccountDataExportEnabled()
  return toExportResource(await createAccountDataExport({ ownerId, includeTranscript }))
}

export async function getAccountDataExportStatus(ownerId: string) {
  if (!serverEnv.ACCOUNT_DATA_EXPORT_ENABLED) return { enabled: false, export: null }
  const row = await getLatestAccountExport(ownerId)
  return { enabled: true, export: row ? await withDownload(row) : null }
}
