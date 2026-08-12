import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { getUserWithPreferences } from "@/lib/auth/identity-repository"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { deleteAccount } from "@/lib/privacy/service"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const GET = withApiRoute(async (request: NextRequest) => {
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  const result = await getUserWithPreferences(principal.userId)
  if (!result) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Account not found.",
      expose: true,
    })
  }
  return NextResponse.json({
    user: {
      id: result.user.id,
      email: result.user.email,
      acceptable_use_accepted_at: result.user.acceptableUseAcceptedAt,
      acceptable_use_version: result.user.acceptableUseVersion,
      default_retention_setting: result.user.defaultRetentionSetting,
      created_at: result.user.createdAt,
    },
    preferences: {
      confidence_display: "categorical",
      jargon_plain_language: result.preferences.jargonPlainLanguage,
      reading_density: result.preferences.readingDensity,
      accessibility_prefs: result.preferences.accessibilityPrefs,
    },
  })
})

export const DELETE = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  return NextResponse.json(await deleteAccount(principal.userId), { status: 202 })
})
