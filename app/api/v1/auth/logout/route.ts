import { NextResponse, type NextRequest } from "next/server"

import { getOidcDiscovery, providerLogoutUrl } from "@/lib/auth/oidc"
import { serverEnv } from "@/lib/env/server"
import { logger } from "@/lib/observability/logger"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<Response> {
  let destination = new URL("/", request.url)
  try {
    const providerDestination = providerLogoutUrl(await getOidcDiscovery())
    if (providerDestination) destination = providerDestination
  } catch (error) {
    logger.warn("auth.provider_logout_unavailable", { error })
  }
  const response = NextResponse.redirect(destination)
  response.cookies.set(serverEnv.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  response.headers.set("cache-control", "no-store")
  return response
}
