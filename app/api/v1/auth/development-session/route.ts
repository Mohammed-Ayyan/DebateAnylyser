import { NextResponse, type NextRequest } from "next/server"

import { DEVELOPMENT_IDENTITY, isDevelopmentSessionAllowed } from "@/lib/auth/development-session"
import { upsertIdentity } from "@/lib/auth/identity-repository"
import { applicationUrl, safeReturnTo } from "@/lib/auth/navigation"
import { issueSessionToken } from "@/lib/auth/session"
import { serverEnv } from "@/lib/env/server"
import { assertTrustedOrigin } from "@/lib/http/origin"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<Response> {
  if (!isDevelopmentSessionAllowed(serverEnv.APP_ENV)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    )
  }
  assertTrustedOrigin(request)
  const user = await upsertIdentity(DEVELOPMENT_IDENTITY)
  const session = await issueSessionToken({
    userId: user.id,
    email: user.email,
    providerRef: user.authProviderRef,
  })
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"))
  const response = NextResponse.redirect(
    applicationUrl(serverEnv.APP_ORIGIN ?? request.nextUrl.origin, returnTo),
    303,
  )
  response.cookies.set(serverEnv.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  })
  response.headers.set("cache-control", "no-store")
  return response
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isDevelopmentSessionAllowed(serverEnv.APP_ENV)) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    )
  }
  const user = await upsertIdentity(DEVELOPMENT_IDENTITY)
  const session = await issueSessionToken({
    userId: user.id,
    email: user.email,
    providerRef: user.authProviderRef,
  })
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"))
  const response = NextResponse.redirect(
    applicationUrl(serverEnv.APP_ORIGIN ?? request.nextUrl.origin, returnTo),
    303,
  )
  response.cookies.set(serverEnv.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  })
  response.headers.set("cache-control", "no-store")
  return response
}
