import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { analyses } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import type { AuthenticatedPrincipal } from "@/lib/auth/types"
import { isAnalysisOwner } from "./ownership"

export async function authorizeAnalysisOwner(
  principal: AuthenticatedPrincipal,
  analysisId: string,
) {
  const [analysis] = await getDatabase()
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, analysisId), isNull(analyses.deletedAt)))
    .limit(1)
  if (!analysis) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Analysis not found.",
      expose: true,
    })
  }
  if (!isAnalysisOwner(principal, analysis.ownerId)) {
    throw new AppError({
      code: "FORBIDDEN",
      status: 403,
      message: "Access is not permitted.",
      expose: true,
    })
  }
  return analysis
}
