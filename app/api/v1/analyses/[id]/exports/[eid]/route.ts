import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { exportResourceSchema } from "@/lib/exports/contracts"
import { getReportExport } from "@/lib/exports/service"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string; eid: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id, eid } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  return NextResponse.json(
    exportResourceSchema.parse(await getReportExport(principal.userId, id, eid)),
  )
})
