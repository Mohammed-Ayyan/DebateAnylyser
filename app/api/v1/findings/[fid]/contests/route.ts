import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeFindingOwner } from "@/lib/authz/interaction-policy"
import { contestReceiptSchema, createContestSchema } from "@/lib/contests/contracts"
import { createOrGetOpenContest, toPublicContest } from "@/lib/contests/repository"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ fid: string }> }

export const POST = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { fid } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const parsed = createContestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    throw new AppError({
      code: "INVALID_CONTEST",
      status: 400,
      message: "Contest reason must be plain text up to 2,000 characters.",
      expose: true,
    })
  const owned = await authorizeFindingOwner(principal, fid)
  const state = await loadPublicAnalysisState(owned.analysis.id)
  if (!state.assembled?.findings.some((finding) => finding.id === fid)) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Finding not found.",
      expose: true,
    })
  }
  const row = await createOrGetOpenContest({
    findingId: fid,
    userId: principal.userId,
    reason: parsed.data.reason,
  })
  return NextResponse.json(
    contestReceiptSchema.parse({
      contest: toPublicContest(row),
      finding_state: "contested",
      acknowledgement: "recorded_for_review",
    }),
    { status: 201 },
  )
})
