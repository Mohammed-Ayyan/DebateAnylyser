import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import type { AuthenticatedPrincipal } from "@/lib/auth/types"
import { isAnalysisOwner } from "@/lib/authz/ownership"
import { analyses } from "@/lib/db/schema/analysis"
import { findings } from "@/lib/db/schema/findings"
import { annotations } from "@/lib/db/schema/interactions"
import { getDatabase } from "@/lib/db/client"
import { AppError } from "@/lib/errors/app-error"

function notFound(resource: string): never {
  throw new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: `${resource} not found.`,
    expose: true,
  })
}
function requireOwner(principal: AuthenticatedPrincipal, ownerId: string): void {
  if (!isAnalysisOwner(principal, ownerId)) {
    throw new AppError({
      code: "FORBIDDEN",
      status: 403,
      message: "Access is not permitted.",
      expose: true,
    })
  }
}
export async function authorizeFindingOwner(principal: AuthenticatedPrincipal, findingId: string) {
  const [row] = await getDatabase()
    .select({ finding: findings, analysis: analyses })
    .from(findings)
    .innerJoin(analyses, eq(findings.analysisId, analyses.id))
    .where(and(eq(findings.id, findingId), isNull(analyses.deletedAt)))
    .limit(1)
  if (!row) notFound("Finding")
  requireOwner(principal, row.analysis.ownerId)
  return row
}
export async function authorizeAnnotationOwner(
  principal: AuthenticatedPrincipal,
  annotationId: string,
) {
  const [row] = await getDatabase()
    .select({ annotation: annotations, analysis: analyses })
    .from(annotations)
    .innerJoin(analyses, eq(annotations.analysisId, analyses.id))
    .where(and(eq(annotations.id, annotationId), isNull(analyses.deletedAt)))
    .limit(1)
  if (!row) notFound("Annotation")
  requireOwner(principal, row.analysis.ownerId)
  return row
}
