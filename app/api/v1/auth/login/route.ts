import { NextResponse, type NextRequest } from "next/server"

import { resolvePrincipal } from "@/lib/auth/principal"
import {
  AUTH_TRANSACTION_COOKIE,
  AUTH_TRANSACTION_TTL_SECONDS,
  buildAuthorizationUrl,
  createAuthTransaction,
  getOidcDiscovery,
} from "@/lib/auth/oidc"
import { safeReturnTo } from "@/lib/auth/navigation"
import { serverEnv } from "@/lib/env/server"
import { logger } from "@/lib/observability/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<Response> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"))
  try {
    if ((await resolvePrincipal(request)).kind === "authenticated") {
      return NextResponse.redirect(new URL(returnTo, request.url))
    }
    const screenHint =
      request.nextUrl.searchParams.get("screen_hint") === "signup" ? "signup" : undefined
    const [discovery, auth] = await Promise.all([
      getOidcDiscovery(),
      createAuthTransaction(returnTo),
    ])
    const response = NextResponse.redirect(
      buildAuthorizationUrl(discovery, auth.transaction, auth.codeChallenge, screenHint),
    )
    response.cookies.set(AUTH_TRANSACTION_COOKIE, auth.token, {
      httpOnly: true,
      secure: serverEnv.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: AUTH_TRANSACTION_TTL_SECONDS,
      expires: auth.expiresAt,
    })
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    logger.error("auth.login_start_failed", { error })
    const failure = new URL("/auth/signin", request.url)
    failure.searchParams.set("error", "provider_unavailable")
    failure.searchParams.set("return_to", returnTo)
    return NextResponse.redirect(failure)
  }
}
