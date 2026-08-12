import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { AppError } from "@/lib/errors/app-error"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, analysisId)
  const state = await loadPublicAnalysisState(analysisId)
  const stage = state.stageRuns.find((run) => run.stage === "S2")
  if (!stage) {
    throw new AppError({
      code: "CLAIMS_NOT_READY",
      status: 404,
      message: "Claim extraction has not started.",
      expose: true,
      retryable: true,
    })
  }
  return NextResponse.json({
    stage_status: stage.status,
    attempt: stage.attempt,
    assembly_ready: state.assembled !== undefined,
    findings: state.assembled?.findings.filter((finding) => finding.kind === "claim") ?? [],
  })
})
