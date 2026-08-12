import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { AppError } from "@/lib/errors/app-error"
import {
  accountDataExportRequestSchema,
  accountDataExportStatusSchema,
  exportResourceSchema,
} from "@/lib/exports/contracts"
import { getAccountDataExportStatus, requestAccountDataExport } from "@/lib/exports/service"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const GET = withApiRoute(async (request: NextRequest) => {
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  return NextResponse.json(
    accountDataExportStatusSchema.parse(await getAccountDataExportStatus(principal.userId)),
  )
})

export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const parsed = accountDataExportRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_EXPORT_REQUEST",
      status: 400,
      message: "Invalid account data export request.",
      expose: true,
    })
  }
  return NextResponse.json(
    exportResourceSchema.parse(
      await requestAccountDataExport(principal.userId, parsed.data.include_transcript),
    ),
    { status: 202 },
  )
})
