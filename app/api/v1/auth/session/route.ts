import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { resolvePrincipal } from "@/lib/auth/principal"
import { upsertIdentity } from "@/lib/auth/identity-repository"
import {
  CredentialVerificationError,
  issueSessionToken,
  verifyExternalCredential,
} from "@/lib/auth/session"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

const requestSchema = z.object({ credential: z.string().min(1).max(16_384) }).strict()

export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  await enforceRateLimit("B", getRequestRateLimitSubject(request))
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_REQUEST",
      status: 400,
      message: "A valid credential is required.",
      expose: true,
    })
  }
  let identity
  try {
    identity = await verifyExternalCredential(parsed.data.credential)
  } catch (error) {
    if (error instanceof CredentialVerificationError) {
      throw new AppError({
        code: "INVALID_CREDENTIAL",
        status: 401,
        message: "The credential is invalid.",
        expose: true,
        cause: error,
      })
    }
    throw error
  }
  const user = await upsertIdentity(identity)
  const session = await issueSessionToken({
    userId: user.id,
    email: user.email,
    providerRef: user.authProviderRef,
  })
  const response = NextResponse.json({
    user: { id: user.id, email: user.email, created_at: user.createdAt },
    session: { expires_at: session.expiresAt },
  })
  response.cookies.set(serverEnv.SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  })
  return response
})

export const DELETE = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = await resolvePrincipal(request)
  await enforceRateLimit(
    "B",
    getRequestRateLimitSubject(request, principal.kind === "authenticated" ? principal : undefined),
  )
  const response = new NextResponse(null, { status: 204 })
  response.cookies.set(serverEnv.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
})
