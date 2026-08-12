import "server-only"

import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose"

import { SESSION_AUDIENCE, SESSION_ISSUER } from "@/lib/auth/session-token"
import { requireServerEnv } from "@/lib/env/server"

const encoder = new TextEncoder()
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

export type ExternalIdentity = { providerRef: string; email: string }
export type SessionClaims = ExternalIdentity & { userId: string }

const invalidCredentialCodes = new Set([
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_EXPIRED",
  "ERR_JWT_INVALID",
  "ERR_JWKS_NO_MATCHING_KEY",
])

export class CredentialVerificationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "CredentialVerificationError"
  }
}

function isInvalidCredentialCause(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    invalidCredentialCodes.has(error.code)
  )
}

function getJwks() {
  const { AUTH_JWKS_URL } = requireServerEnv("AUTH_JWKS_URL")
  remoteJwks ??= createRemoteJWKSet(new URL(AUTH_JWKS_URL))
  return remoteJwks
}

async function verifyProviderToken(credential: string) {
  const { AUTH_ISSUER, AUTH_AUDIENCE } = requireServerEnv("AUTH_ISSUER", "AUTH_AUDIENCE")
  try {
    const { payload } = await jwtVerify(credential, getJwks(), {
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp"],
    })
    if (!payload.sub) throw new CredentialVerificationError("Identity credential has no subject.")
    return { payload, providerRef: `${AUTH_ISSUER}#${payload.sub}` }
  } catch (error) {
    if (error instanceof CredentialVerificationError) throw error
    if (isInvalidCredentialCause(error)) {
      throw new CredentialVerificationError("The identity credential is invalid.", error)
    }
    throw error
  }
}

export async function verifyBearerCredential(credential: string): Promise<{ providerRef: string }> {
  const { providerRef } = await verifyProviderToken(credential)
  return { providerRef }
}

export async function verifyExternalCredential(credential: string): Promise<ExternalIdentity> {
  const { payload, providerRef } = await verifyProviderToken(credential)
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
  if (!email || email.length > 320 || !email.includes("@")) {
    throw new CredentialVerificationError("Identity credential is missing an email claim.")
  }
  return { providerRef, email }
}

export async function issueSessionToken(
  claims: SessionClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const { SESSION_SECRET } = requireServerEnv("SESSION_SECRET")
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const token = await new SignJWT({ email: claims.email, provider_ref: claims.providerRef })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(encoder.encode(SESSION_SECRET))
  return { token, expiresAt }
}
