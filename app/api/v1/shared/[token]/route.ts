import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"
import { publicShareHeaders } from "@/lib/shares/headers"
import { getSharedAnalysis } from "@/lib/shares/service"

type RouteContext = { params: Promise<{ token: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  await enforceRateLimit("P", getRequestRateLimitSubject(request))
  const { token } = await context.params
  const response = NextResponse.json(await getSharedAnalysis(token))
  for (const [name, value] of Object.entries(publicShareHeaders)) response.headers.set(name, value)
  return response
})
