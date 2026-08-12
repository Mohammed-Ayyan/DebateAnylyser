import "server-only"

import { AppError } from "@/lib/errors/app-error"
import { deleteAnalysisForOwner } from "@/lib/privacy/service"
import type { HistoryListQuery, HistoryPatchBody } from "./contracts"
import { decodeHistoryCursor, encodeHistoryCursor } from "./cursor"
import { listHistoryRows, patchHistoryAnalysis, resumeHistoryAnalysis } from "./repository"

export async function listAnalysisHistory(ownerId: string, query: HistoryListQuery) {
  let cursor
  try {
    cursor = query.cursor ? decodeHistoryCursor(query.cursor) : undefined
  } catch {
    throw new AppError({
      code: "INVALID_CURSOR",
      status: 400,
      message: "Invalid cursor.",
      expose: true,
    })
  }
  const page = await listHistoryRows(ownerId, query, cursor)
  const last = page.items.at(-1)
  return {
    items: page.items,
    next_cursor:
      page.hasMore && last
        ? encodeHistoryCursor({ created_at: last.created_at, id: last.id })
        : null,
  }
}

export const updateHistoryAnalysis = (
  ownerId: string,
  analysisId: string,
  patch: HistoryPatchBody,
) => patchHistoryAnalysis(ownerId, analysisId, patch)

export const deleteHistoryAnalysis = deleteAnalysisForOwner
export const resumeAnalysis = resumeHistoryAnalysis
