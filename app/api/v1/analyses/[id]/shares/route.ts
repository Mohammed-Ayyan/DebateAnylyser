import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"
import { createShareSchema, createdShareSchema, shareListSchema } from "@/lib/shares/contracts"
import { createShare, getShares } from "@/lib/shares/service"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  return NextResponse.json(shareListSchema.parse({ shares: await getShares(id, principal.userId) }))
})

export const POST = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  const parsed = createShareSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_SHARE",
      status: 400,
      message: "Invalid share request.",
      expose: true,
    })
  }
  const expiresAt = parsed.data.expires_at ? new Date(parsed.data.expires_at) : null
  return NextResponse.json(
    createdShareSchema.parse(
      await createShare({ analysisId: id, ownerId: principal.userId, expiresAt }),
    ),
    { status: 201 },
  )
})
