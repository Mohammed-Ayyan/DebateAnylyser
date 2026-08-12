import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

import { requireServerEnv } from "@/lib/env/server"
import { applicationUrl, safeReturnTo } from "./navigation"
import type { ExternalIdentity } from "./session"

const encoder = new TextEncoder()
const transactionAudience = "debate-analyser-auth-transaction"
const transactionIssuer = "debate-analyser"
export const AUTH_TRANSACTION_COOKIE = "debate_auth_transaction"
export const AUTH_TRANSACTION_TTL_SECONDS = 10 * 60

const discoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  end_session_endpoint: z.string().url().optional(),
})
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.string().transform((value) => value.toLowerCase()),
  expires_in: z.number().int().positive(),
})
const transactionSchema = z.object({
  state: z.string().min(32),
  nonce: z.string().min(32),
  codeVerifier: z.string().min(43).max(128),
  returnTo: z.string().startsWith("/"),
})

export type OidcDiscovery = z.infer<typeof discoverySchema>
export type AuthTransaction = z.infer<typeof transactionSchema>
export type OidcTokenSet = z.infer<typeof tokenResponseSchema>

let discoveryPromise: Promise<OidcDiscovery> | undefined
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

function assertProviderEndpoint(value: string, issuer: URL): void {
  const endpoint = new URL(value)
  if (endpoint.protocol !== "https:" || endpoint.host !== issuer.host) {
    throw new Error("OIDC discovery returned an untrusted provider endpoint.")
  }
}

export async function getOidcDiscovery(fetchImpl: typeof fetch = fetch): Promise<OidcDiscovery> {
  if (fetchImpl === fetch && discoveryPromise) return discoveryPromise
  const load = async () => {
    const { AUTH_ISSUER } = requireServerEnv("AUTH_ISSUER")
    const issuer = new URL(AUTH_ISSUER)
    const discoveryUrl = new URL(".well-known/openid-configuration", AUTH_ISSUER)
    const response = await fetchImpl(discoveryUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error("OIDC discovery is unavailable.")
    const parsed = discoverySchema.parse(await response.json())
    if (new URL(parsed.issuer).href !== issuer.href) {
      throw new Error("OIDC discovery issuer does not match AUTH_ISSUER.")
    }
    assertProviderEndpoint(parsed.authorization_endpoint, issuer)
    assertProviderEndpoint(parsed.token_endpoint, issuer)
    if (parsed.end_session_endpoint) assertProviderEndpoint(parsed.end_session_endpoint, issuer)
    return parsed
  }
  if (fetchImpl !== fetch) return load()
  discoveryPromise = load().catch((error) => {
    discoveryPromise = undefined
    throw error
  })
  return discoveryPromise
}

function getRemoteJwks() {
  const { AUTH_JWKS_URL } = requireServerEnv("AUTH_JWKS_URL")
  remoteJwks ??= createRemoteJWKSet(new URL(AUTH_JWKS_URL))
  return remoteJwks
}

export async function createAuthTransaction(returnToValue?: string | null): Promise<{
  transaction: AuthTransaction
  token: string
  expiresAt: Date
  codeChallenge: string
}> {
  const { SESSION_SECRET } = requireServerEnv("SESSION_SECRET")
  const transaction: AuthTransaction = {
    state: base64url(randomBytes(32)),
    nonce: base64url(randomBytes(32)),
    codeVerifier: base64url(randomBytes(48)),
    returnTo: safeReturnTo(returnToValue),
  }
  const expiresAt = new Date(Date.now() + AUTH_TRANSACTION_TTL_SECONDS * 1_000)
  const token = await new SignJWT(transaction)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(transactionIssuer)
    .setAudience(transactionAudience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
    .sign(encoder.encode(SESSION_SECRET))
  const codeChallenge = createHash("sha256").update(transaction.codeVerifier).digest("base64url")
  return { transaction, token, expiresAt, codeChallenge }
}

export async function verifyAuthTransaction(token: string): Promise<AuthTransaction> {
  const { SESSION_SECRET } = requireServerEnv("SESSION_SECRET")
  const { payload } = await jwtVerify(token, encoder.encode(SESSION_SECRET), {
    issuer: transactionIssuer,
    audience: transactionAudience,
    algorithms: ["HS256"],
    requiredClaims: ["iat", "exp"],
  })
  return transactionSchema.parse(payload)
}

export function statesMatch(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  )
}

export function buildAuthorizationUrl(
  discovery: OidcDiscovery,
  transaction: AuthTransaction,
  codeChallenge: string,
  screenHint?: "signup",
): URL {
  const { APP_ORIGIN, AUTH_AUDIENCE, AUTH_CLIENT_ID } = requireServerEnv(
    "APP_ORIGIN",
    "AUTH_AUDIENCE",
    "AUTH_CLIENT_ID",
  )
  const url = new URL(discovery.authorization_endpoint)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", AUTH_CLIENT_ID)
  url.searchParams.set("redirect_uri", applicationUrl(APP_ORIGIN, "/api/v1/auth/callback").href)
  url.searchParams.set("scope", "openid profile email")
  url.searchParams.set("audience", AUTH_AUDIENCE)
  url.searchParams.set("state", transaction.state)
  url.searchParams.set("nonce", transaction.nonce)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  if (screenHint) url.searchParams.set("screen_hint", screenHint)
  return url
}

export async function exchangeAuthorizationCode(
  discovery: OidcDiscovery,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcTokenSet> {
  const { APP_ORIGIN, AUTH_CLIENT_ID, AUTH_CLIENT_SECRET } = requireServerEnv(
    "APP_ORIGIN",
    "AUTH_CLIENT_ID",
    "AUTH_CLIENT_SECRET",
  )
  const response = await fetchImpl(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: AUTH_CLIENT_ID,
      client_secret: AUTH_CLIENT_SECRET,
      code,
      code_verifier: codeVerifier,
      redirect_uri: applicationUrl(APP_ORIGIN, "/api/v1/auth/callback").href,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error("OIDC authorization code exchange failed.")
  const tokenSet = tokenResponseSchema.parse(await response.json())
  if (tokenSet.token_type !== "bearer") throw new Error("OIDC returned an unsupported token type.")
  return tokenSet
}

export async function verifyOidcTokenSet(
  tokenSet: OidcTokenSet,
  expectedNonce: string,
): Promise<ExternalIdentity> {
  const { AUTH_ISSUER, AUTH_AUDIENCE, AUTH_CLIENT_ID } = requireServerEnv(
    "AUTH_ISSUER",
    "AUTH_AUDIENCE",
    "AUTH_CLIENT_ID",
  )
  const jwks = getRemoteJwks()
  const [{ payload: idPayload }, { payload: accessPayload }] = await Promise.all([
    jwtVerify(tokenSet.id_token, jwks, {
      issuer: AUTH_ISSUER,
      audience: AUTH_CLIENT_ID,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "email", "nonce", "iat", "exp"],
    }),
    jwtVerify(tokenSet.access_token, jwks, {
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "iat", "exp"],
    }),
  ])
  if (idPayload.nonce !== expectedNonce) throw new Error("OIDC nonce validation failed.")
  if (!idPayload.sub || accessPayload.sub !== idPayload.sub) {
    throw new Error("OIDC token subjects do not match.")
  }
  const email = typeof idPayload.email === "string" ? idPayload.email.trim().toLowerCase() : ""
  if (!email || email.length > 320 || !email.includes("@")) {
    throw new Error("OIDC identity is missing required claims.")
  }
  if (idPayload.email_verified === false) throw new Error("OIDC email is not verified.")
  return { providerRef: `${AUTH_ISSUER}#${idPayload.sub}`, email }
}

export function providerLogoutUrl(discovery: OidcDiscovery): URL | null {
  if (!discovery.end_session_endpoint) return null
  const { APP_ORIGIN, AUTH_CLIENT_ID } = requireServerEnv("APP_ORIGIN", "AUTH_CLIENT_ID")
  const url = new URL(discovery.end_session_endpoint)
  url.searchParams.set("client_id", AUTH_CLIENT_ID)
  url.searchParams.set("post_logout_redirect_uri", applicationUrl(APP_ORIGIN, "/").href)
  return url
}
