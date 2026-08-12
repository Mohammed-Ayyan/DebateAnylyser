import "server-only"

import type { NextRequest } from "next/server"

import { verifyApplicationSession } from "@/lib/auth/session-token"
import { AppError } from "@/lib/errors/app-error"
import { requireServerEnv, serverEnv } from "@/lib/env/server"
import { findActiveUserById, findActiveUserByProviderRef } from "./identity-repository"
import { CredentialVerificationError, verifyBearerCredential } from "./session"
import type { AuthenticatedPrincipal, Principal } from "./types"

function toPrincipal(
  user: NonNullable<Awaited<ReturnType<typeof findActiveUserById>>>,
  authMethod: "session" | "bearer",
): AuthenticatedPrincipal {
  return {
    kind: "authenticated",
    userId: user.id,
    email: user.email,
    providerRef: user.authProviderRef,
    authMethod,
  }
}

export async function resolvePrincipal(request: NextRequest): Promise<Principal> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) {
    try {
      const identity = await verifyBearerCredential(bearer)
      const user = await findActiveUserByProviderRef(identity.providerRef)
      return user ? toPrincipal(user, "bearer") : { kind: "anonymous" }
    } catch (error) {
      if (error instanceof CredentialVerificationError) return { kind: "anonymous" }
      throw error
    }
  }
  const token = request.cookies.get(serverEnv.SESSION_COOKIE_NAME)?.value
  if (!token) return { kind: "anonymous" }
  const { SESSION_SECRET } = requireServerEnv("SESSION_SECRET")
  const payload = await verifyApplicationSession(token, SESSION_SECRET)
  if (!payload?.sub) return { kind: "anonymous" }
  const user = await findActiveUserById(payload.sub)
  return user ? toPrincipal(user, "session") : { kind: "anonymous" }
}

export function requireAuthenticated(principal: Principal): AuthenticatedPrincipal {
  if (principal.kind !== "authenticated") {
    throw new AppError({
      code: "UNAUTHENTICATED",
      status: 401,
      message: "Authentication is required.",
      expose: true,
    })
  }
  return principal
}
