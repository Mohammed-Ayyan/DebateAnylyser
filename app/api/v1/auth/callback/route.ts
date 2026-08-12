import { NextResponse, type NextRequest } from "next/server"

import { upsertIdentity } from "@/lib/auth/identity-repository"
import { applicationUrl } from "@/lib/auth/navigation"
import {
  AUTH_TRANSACTION_COOKIE,
  exchangeAuthorizationCode,
  getOidcDiscovery,
  statesMatch,
  verifyAuthTransaction,
  verifyOidcTokenSet,
} from "@/lib/auth/oidc"
import { issueSessionToken } from "@/lib/auth/session"
import { serverEnv } from "@/lib/env/server"
import { logger } from "@/lib/observability/logger"

export const dynamic = "force-dynamic"

function clearTransaction(response: NextResponse): void {
  response.cookies.set(AUTH_TRANSACTION_COOKIE, "", {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: 0,
  })
}

function failure(request: NextRequest, code: string): NextResponse {
  const url = applicationUrl(serverEnv.APP_ORIGIN ?? request.nextUrl.origin, "/auth/signin")
  url.searchParams.set("error", code)
  const response = NextResponse.redirect(url)
  clearTransaction(response)
  response.headers.set("cache-control", "no-store")
  return response
}

export async function GET(request: NextRequest): Promise<Response> {
  const providerError = request.nextUrl.searchParams.get("error")
  if (providerError) {
    logger.warn("auth.provider_denied", { providerError })
    return failure(request, providerError === "access_denied" ? "access_denied" : "provider_error")
  }
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const transactionToken = request.cookies.get(AUTH_TRANSACTION_COOKIE)?.value
  if (!code || !state || !transactionToken) return failure(request, "invalid_callback")

  try {
    const transaction = await verifyAuthTransaction(transactionToken)
    if (!statesMatch(transaction.state, state)) return failure(request, "state_mismatch")
    const discovery = await getOidcDiscovery()
    const tokenSet = await exchangeAuthorizationCode(discovery, code, transaction.codeVerifier)
    const identity = await verifyOidcTokenSet(tokenSet, transaction.nonce)
    const user = await upsertIdentity(identity)
    const session = await issueSessionToken({
      userId: user.id,
      email: user.email,
      providerRef: user.authProviderRef,
    })
    const destination = applicationUrl(
      serverEnv.APP_ORIGIN ?? request.nextUrl.origin,
      transaction.returnTo,
    )
    const response = NextResponse.redirect(destination)
    clearTransaction(response)
    response.cookies.set(serverEnv.SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: serverEnv.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
    })
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    logger.error("auth.callback_failed", { error })
    return failure(request, "callback_failed")
  }
}
