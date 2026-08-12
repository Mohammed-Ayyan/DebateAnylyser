import "server-only"

import { TextEncoder } from "node:util"

import { listAnnotationsForAnalysis } from "@/lib/annotations/repository"
import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { getUserWithPreferences } from "@/lib/auth/identity-repository"
import { listContestsForAnalysis } from "@/lib/contests/repository"
import { AppError } from "@/lib/errors/app-error"
import { PUBLICATION_DISCLAIMER } from "@/lib/legal/publication-copy"
import { S3ObjectStorage } from "@/lib/storage/s3-storage"
import type { ObjectStorage } from "@/lib/storage/types"
import { getTranscriptForAnalysis } from "@/lib/transcription/transcript-repository"
import { accountArtifactKey, reportArtifactKey } from "./artifact-keys"
import { assertSafeAccountExport, projectAccountData } from "./account-projector"
import { projectOwnerCuration } from "./publication-projection"
import { renderHtmlReport, type RenderHtmlReportInput } from "./render-html"
import {
  getExportForWorker,
  listActiveAnalysesForAccount,
  markExportProcessing,
} from "./repository"

export function buildHtmlArtifact(input: RenderHtmlReportInput): Uint8Array {
  return new TextEncoder().encode(renderHtmlReport(input))
}

async function writeImmutable(
  storage: ObjectStorage,
  request: Parameters<ObjectStorage["writeImmutableObject"]>[0],
) {
  try {
    await storage.writeImmutableObject(request)
  } catch (error) {
    if (!(error instanceof AppError && error.code === "IMMUTABLE_OBJECT_EXISTS")) throw error
  }
}
export async function renderReportExport(
  exportId: string,
  storage: ObjectStorage = new S3ObjectStorage(),
): Promise<{ objectKey: string; contentType: string }> {
  const row = await getExportForWorker(exportId)
  if (row.kind !== "report_html" || !row.analysisId) throw new Error("INVALID_REPORT_EXPORT")
  if (row.status === "complete" && row.objectKey && row.contentType) {
    return { objectKey: row.objectKey, contentType: row.contentType }
  }
  await markExportProcessing(exportId)
  const state = await loadPublicAnalysisState(row.analysisId, { requireS9: true })
  if (!state.assembled) throw new Error("ANALYSIS_NOT_READY")
  const [annotations, contests] = await Promise.all([
    listAnnotationsForAnalysis(row.analysisId),
    listContestsForAnalysis(row.analysisId),
  ])
  const curation = projectOwnerCuration(row.ownerId, annotations, contests)
  const analyses = await listActiveAnalysesForAccount(row.ownerId)
  const analysis = analyses.find((candidate) => candidate.id === row.analysisId)
  if (!analysis) throw new Error("ANALYSIS_NOT_FOUND")
  if (!row.disclaimerVersion || !row.limitationsUrl) throw new Error("DISCLOSURE_SNAPSHOT_MISSING")
  const objectKey = reportArtifactKey(row.ownerId, row.analysisId, row.id)
  await writeImmutable(storage, {
    mediaKey: objectKey,
    contentType: "text/html; charset=utf-8",
    bytes: buildHtmlArtifact({
      analysis: state.assembled,
      title: analysis.title,
      analysis_id: row.analysisId,
      generated_at: new Date().toISOString(),
      disclaimer_text: PUBLICATION_DISCLAIMER,
      disclaimer_version: row.disclaimerVersion,
      limitations_url: row.limitationsUrl,
      annotations: curation.annotations,
      contests: curation.contests,
    }),
    metadata: { "export-id": row.id, "owner-id": row.ownerId },
  })
  return { objectKey, contentType: "text/html; charset=utf-8" }
}
export async function renderAccountDataExport(
  exportId: string,
  includeTranscript: boolean,
  storage: ObjectStorage = new S3ObjectStorage(),
): Promise<{ objectKey: string; contentType: string }> {
  const row = await getExportForWorker(exportId)
  if (row.kind !== "account_data_json" || row.analysisId !== null) {
    throw new Error("INVALID_ACCOUNT_EXPORT")
  }
  if (row.status === "complete" && row.objectKey && row.contentType) {
    return { objectKey: row.objectKey, contentType: row.contentType }
  }
  await markExportProcessing(exportId)
  const identity = await getUserWithPreferences(row.ownerId)
  if (!identity) throw new Error("ACCOUNT_NOT_FOUND")
  const analysisRows = await listActiveAnalysesForAccount(row.ownerId)
  const projectedAnalyses = await Promise.all(
    analysisRows.map(async (analysis) => {
      const [annotations, contests, publicState, transcript] = await Promise.all([
        listAnnotationsForAnalysis(analysis.id),
        listContestsForAnalysis(analysis.id),
        loadPublicAnalysisState(analysis.id, { requireS9: true }),
        includeTranscript ? getTranscriptForAnalysis(analysis.id) : Promise.resolve(undefined),
      ])
      return {
        id: analysis.id,
        title: analysis.title,
        status: analysis.status,
        sourceType: analysis.sourceType,
        language: analysis.language,
        retentionSetting: analysis.retentionSetting,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt,
        annotations: annotations.filter((item) => item.authorId === row.ownerId),
        contests: contests.filter((item) => item.userId === row.ownerId),
        assembled: publicState.assembled,
        transcript: transcript?.segments,
      }
    }),
  )
  const output = projectAccountData({
    generatedAt: new Date().toISOString(),
    account: {
      id: identity.user.id,
      email: identity.user.email,
      createdAt: identity.user.createdAt,
      defaultRetentionSetting: identity.user.defaultRetentionSetting,
      preferences: identity.preferences,
    },
    analyses: projectedAnalyses,
  })
  assertSafeAccountExport(output)
  const objectKey = accountArtifactKey(row.ownerId, row.id)
  await writeImmutable(storage, {
    mediaKey: objectKey,
    contentType: "application/json; charset=utf-8",
    bytes: new TextEncoder().encode(JSON.stringify(output, null, 2)),
    metadata: { "export-id": row.id, "owner-id": row.ownerId },
  })
  return { objectKey, contentType: "application/json; charset=utf-8" }
}
