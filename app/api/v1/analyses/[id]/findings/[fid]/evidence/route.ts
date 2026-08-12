import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { getEvidenceForFinding } from "@/lib/evidence/repository"
import { AppError } from "@/lib/errors/app-error"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string; fid: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId, fid: findingId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, analysisId)

  const publicState = await loadPublicAnalysisState(analysisId)
  const publicFinding = publicState.assembled?.findings.find(
    (finding) => finding.id === findingId && finding.kind === "claim",
  )
  if (!publicFinding) {
    throw new AppError({
      code: "FINDING_NOT_FOUND",
      status: 404,
      message: "Finding not found.",
      expose: true,
    })
  }
  const evidence = await getEvidenceForFinding(analysisId, findingId)
  if (!evidence) {
    throw new AppError({
      code: "FINDING_NOT_FOUND",
      status: 404,
      message: "Finding not found.",
      expose: true,
    })
  }

  return NextResponse.json({
    finding_id: findingId,
    verification_state: evidence.sources.length > 0 ? "verified" : "unverified",
    claim_spans: evidence.spans,
    sources: evidence.sources,
  })
})
