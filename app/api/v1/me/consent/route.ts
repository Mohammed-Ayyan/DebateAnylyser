import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { z } from "zod"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { recordAcceptableUseConsent } from "@/lib/legal/consent-repository"
import { requireApprovedLegalPolicy } from "@/lib/legal/server-policy"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

const requestSchema = z.object({ acceptable_use_version: z.string().min(1).max(64) }).strict()

export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_REQUEST",
      status: 400,
      message: "A valid acceptable-use policy version is required.",
      expose: true,
    })
  }

  const policy = requireApprovedLegalPolicy()
  if (parsed.data.acceptable_use_version !== policy.version) {
    throw new AppError({
      code: "legal_version_mismatch",
      status: 400,
      message: "The submitted acceptable-use policy version is not current.",
      expose: true,
      publicDetails: { current_version: policy.version, legal_url: "/legal" },
    })
  }

  const consent = await recordAcceptableUseConsent(principal.userId, policy.version)
  if (!consent?.acceptedAt) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Account not found.",
      expose: true,
    })
  }

  return NextResponse.json({
    accepted_at: consent.acceptedAt,
    acceptable_use_version: consent.version,
  })
})
