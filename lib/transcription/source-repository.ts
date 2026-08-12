import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import type { AnalysisStatus } from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import { analyses, analysisInputs, uploads } from "@/lib/db/schema"
import { TranscriptionError } from "./contracts"

export type TranscriptionSource =
  | { type: "paste"; text: string }
  | { type: "upload"; mediaKey: string; contentType: string; size: number }
  | {
      type: "url"
      url: string
      retrievalMethod: "official_api" | "official_captions" | "direct_fetch"
    }

export type LoadedAnalysisSource = {
  analysisId: string
  status: AnalysisStatus
  source: TranscriptionSource
}

export async function loadAnalysisSource(analysisId: string): Promise<LoadedAnalysisSource> {
  const [row] = await getDatabase()
    .select({
      id: analyses.id,
      status: analyses.status,
      sourceType: analyses.sourceType,
      sourceMediaKey: analyses.sourceMediaKey,
      sourceUrl: analyses.sourceUrl,
      sourceRetrievalMethod: analyses.sourceRetrievalMethod,
      rightsCheckResult: analyses.rightsCheckResult,
      pasteText: analysisInputs.pasteText,
      uploadContentType: uploads.contentType,
      uploadSize: uploads.size,
    })
    .from(analyses)
    .leftJoin(analysisInputs, eq(analysisInputs.analysisId, analyses.id))
    .leftJoin(uploads, eq(uploads.mediaKey, analyses.sourceMediaKey))
    .where(and(eq(analyses.id, analysisId), isNull(analyses.deletedAt)))
    .limit(1)
  if (!row) {
    throw new TranscriptionError("ANALYSIS_NOT_FOUND", "The analysis no longer exists.", false)
  }
  if (row.rightsCheckResult !== "passed") {
    throw new TranscriptionError(
      "RIGHTS_CHECK_REQUIRED",
      "The analysis has not passed the rights gate.",
      false,
    )
  }
  if (row.sourceType === "paste" && row.pasteText) {
    return {
      analysisId: row.id,
      status: row.status,
      source: { type: "paste", text: row.pasteText },
    }
  }

  if (
    row.sourceType === "upload" &&
    row.sourceMediaKey &&
    row.uploadContentType &&
    row.uploadSize !== null
  ) {
    return {
      analysisId: row.id,
      status: row.status,
      source: {
        type: "upload",
        mediaKey: row.sourceMediaKey,
        contentType: row.uploadContentType,
        size: row.uploadSize,
      },
    }
  }
  if (
    row.sourceType === "url" &&
    row.sourceUrl &&
    row.sourceRetrievalMethod &&
    row.sourceRetrievalMethod !== "none"
  ) {
    return {
      analysisId: row.id,
      status: row.status,
      source: {
        type: "url",
        url: row.sourceUrl,
        retrievalMethod: row.sourceRetrievalMethod,
      },
    }
  }
  throw new TranscriptionError(
    "SOURCE_ENVELOPE_INVALID",
    "The stored source envelope is incomplete.",
    false,
  )
}
