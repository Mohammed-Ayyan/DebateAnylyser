import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { updateUserPreferences } from "@/lib/auth/identity-repository"
import { updatePreferencesSchema } from "@/lib/auth/preferences"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const PATCH = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const parsed = updatePreferencesSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_PREFERENCES",
      status: 400,
      message: "Preferences must use categorical confidence and supported accessibility values.",
      expose: true,
    })
  }
  const preferences = await updateUserPreferences(principal.userId, parsed.data)
  return NextResponse.json({
    preferences: {
      confidence_display: "categorical",
      jargon_plain_language: preferences.jargonPlainLanguage,
      reading_density: preferences.readingDensity,
      accessibility_prefs: preferences.accessibilityPrefs,
      default_retention_setting: preferences.defaultRetentionSetting,
    },
  })
})
