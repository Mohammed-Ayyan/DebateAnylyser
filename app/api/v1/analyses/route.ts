import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { findActiveUserById } from "@/lib/auth/identity-repository"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { parseAnalysisSubmission, parseIdempotencyKey } from "@/lib/ingest/contracts"
import { submitAnalysis } from "@/lib/ingest/service"
import { historyListQuerySchema, historyListResponseSchema } from "@/lib/history/contracts"
import { listAnalysisHistory } from "@/lib/history/service"
import { requireApprovedLegalPolicy } from "@/lib/legal/server-policy"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("A", getRequestRateLimitSubject(request, principal))
  const rawSubmission = await request.json().catch(() => null)
  const parsedSubmission = parseAnalysisSubmission(rawSubmission, serverEnv.INGEST_MAX_PASTE_CHARS)
  const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"))
  const user = await findActiveUserById(principal.userId)
  if (!user) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Account not found.",
      expose: true,
    })
  }
  const submission =
    rawSubmission &&
    typeof rawSubmission === "object" &&
    Object.hasOwn(rawSubmission, "retention_setting")
      ? parsedSubmission
      : { ...parsedSubmission, retention_setting: user.defaultRetentionSetting }
  const result = await submitAnalysis(
    principal.userId,
    user.acceptableUseVersion,
    requireApprovedLegalPolicy(),
    submission,
    idempotencyKey,
  )
  return NextResponse.json(
    { id: result.id, status: result.status },
    {
      status: 201,
      headers: {
        location: `/api/v1/analyses/${result.id}`,
        ...(result.replayed ? { "idempotency-replayed": "true" } : {}),
      },
    },
  )
})

export const GET = withApiRoute(async (request: NextRequest) => {
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  const parsed = historyListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  )
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_HISTORY_QUERY",
      status: 400,
      message: "History query parameters are invalid.",
      expose: true,
    })
  }
  const result = await listAnalysisHistory(principal.userId, parsed.data)
  return NextResponse.json(historyListResponseSchema.parse(result))
})
