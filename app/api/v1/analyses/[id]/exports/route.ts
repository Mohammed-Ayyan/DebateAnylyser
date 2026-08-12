import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { AppError } from "@/lib/errors/app-error"
import {
  exportListSchema,
  exportResourceSchema,
  reportExportRequestSchema,
} from "@/lib/exports/contracts"
import { getReportExports, requestReportExport } from "@/lib/exports/service"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  return NextResponse.json(
    exportListSchema.parse({ exports: await getReportExports(principal.userId, id) }),
  )
})

export const POST = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  const parsed = reportExportRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "FORMAT_UNAVAILABLE",
      status: 422,
      message: "Only HTML report export is available; PDF is unavailable.",
      expose: true,
    })
  }
  return NextResponse.json(
    exportResourceSchema.parse(await requestReportExport(principal.userId, id)),
    { status: 202 },
  )
})
