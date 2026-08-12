import { NextResponse, type NextRequest } from "next/server"

import { safeReturnTo } from "@/lib/auth/navigation"
import { verifyApplicationSession } from "@/lib/auth/session-token"

const publicAuthPaths = new Set([
  "/auth/signin",
  "/auth/signup",
  "/auth/2fa",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
])

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const cookieName = process.env.SESSION_COOKIE_NAME || "debate_session"
  const secret = process.env.SESSION_SECRET
  const token = request.cookies.get(cookieName)?.value
  if (!secret || !token) return false
  return Boolean(await verifyApplicationSession(token, secret))
}

export async function proxy(request: NextRequest) {
  const authenticated = await isAuthenticated(request)
  const pathname = request.nextUrl.pathname
  if (publicAuthPaths.has(pathname) && authenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }
  if (!authenticated && !publicAuthPaths.has(pathname)) {
    const login = new URL("/auth/signin", request.url)
    login.searchParams.set("return_to", safeReturnTo(`${pathname}${request.nextUrl.search}`))
    return NextResponse.redirect(login)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/dashboard/:path*",
    "/new-analysis/:path*",
    "/processing/:path*",
    "/workspace/:path*",
    "/reports/:path*",
    "/history/:path*",
    "/source-explorer/:path*",
    "/timeline/:path*",
    "/transcript-viewer/:path*",
    "/settings/:path*",
    "/feedback/:path*",
    "/educator/:path*",
    "/help/:path*",
    "/live-debate/:path*",
  ],
}
