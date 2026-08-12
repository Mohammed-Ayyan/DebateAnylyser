import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { AppError } from "@/lib/errors/app-error"
import { historyResumeResponseSchema } from "@/lib/history/contracts"
import { resumeAnalysis } from "@/lib/history/service"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { parseIdempotencyKey } from "@/lib/ingest/contracts"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"))
  if (!idempotencyKey) {
    throw new AppError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      status: 400,
      message: "Idempotency-Key is required.",
      expose: true,
    })
  }
  const { id } = await context.params
  const result = await resumeAnalysis(principal.userId, id, idempotencyKey)
  return NextResponse.json(historyResumeResponseSchema.parse({ status: result.status }), {
    headers: result.replayed ? { "idempotency-replayed": "true" } : undefined,
  })
})
