import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { publicAnalysisResourceSchema } from "@/lib/contracts/analysis"
import { AppError } from "@/lib/errors/app-error"
import { historyListItemSchema, historyPatchBodySchema } from "@/lib/history/contracts"
import { deleteHistoryAnalysis, updateHistoryAnalysis } from "@/lib/history/service"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  const analysis = await authorizeAnalysisOwner(principal, analysisId)
  const state = await loadPublicAnalysisState(analysisId)
  const assembled = state.assembled

  return NextResponse.json(
    publicAnalysisResourceSchema.parse({
      id: analysis.id,
      title: analysis.title,
      status: analysis.status,
      source_type: analysis.sourceType,
      language: analysis.language,
      created_at: analysis.createdAt.toISOString(),
      updated_at: analysis.updatedAt.toISOString(),
      assembly_ready: assembled !== undefined,
      overview: assembled?.overview ?? null,
      findings: assembled?.findings ?? [],
      sources: assembled?.sources ?? [],
      structure_edges: assembled?.structure_edges ?? [],
      stage_runs: state.stageRuns,
    }),
  )
})

export const PATCH = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const patch = historyPatchBodySchema.safeParse(await request.json().catch(() => null))
  if (!patch.success) {
    throw new AppError({
      code: "INVALID_ANALYSIS_UPDATE",
      status: 400,
      message: "A valid title or retention setting is required.",
      expose: true,
    })
  }
  return NextResponse.json(
    historyListItemSchema.parse(await updateHistoryAnalysis(principal.userId, id, patch.data)),
  )
})

export const DELETE = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  return NextResponse.json(await deleteHistoryAnalysis(principal.userId, id), { status: 202 })
})
