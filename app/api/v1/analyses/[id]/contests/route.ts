import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { contestListSchema } from "@/lib/contests/contracts"
import { listContestsForAnalysis, toPublicContest } from "@/lib/contests/repository"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  const [rows, state] = await Promise.all([
    listContestsForAnalysis(id),
    loadPublicAnalysisState(id),
  ])
  const publicIds = new Set(state.assembled?.findings.map((finding) => finding.id) ?? [])
  return NextResponse.json(
    contestListSchema.parse({
      contests: rows.filter((row) => publicIds.has(row.findingId)).map(toPublicContest),
    }),
  )
})
