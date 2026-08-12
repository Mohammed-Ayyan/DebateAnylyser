import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"
import { shareSchema } from "@/lib/shares/contracts"
import { removeShare } from "@/lib/shares/service"

type RouteContext = { params: Promise<{ id: string; sid: string }> }

export const DELETE = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id, sid } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  return NextResponse.json(shareSchema.parse(await removeShare(sid, id, principal.userId)))
})
