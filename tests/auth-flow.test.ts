import { SignJWT } from "jose"
import { describe, expect, it } from "vitest"

import { safeReturnTo } from "@/lib/auth/navigation"
import {
  SESSION_AUDIENCE,
  SESSION_ISSUER,
  verifyApplicationSession,
} from "@/lib/auth/session-token"

const secret = "auth-flow-test-session-secret-at-least-32-characters"
const encoder = new TextEncoder()

describe("authentication navigation", () => {
  it("preserves only application-relative return destinations", () => {
    expect(safeReturnTo("/history?status=complete")).toBe("/history?status=complete")
    expect(safeReturnTo("https://attacker.example/path")).toBe("/dashboard")
    expect(safeReturnTo("//attacker.example/path")).toBe("/dashboard")
    expect(safeReturnTo("/api/v1/auth/callback")).toBe("/dashboard")
  })
})

describe("application sessions", () => {
  it("persists a valid unexpired subject and rejects altered tokens", async () => {
    const token = await new SignJWT({ email: "user@example.test" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setIssuer(SESSION_ISSUER)
      .setAudience(SESSION_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(encoder.encode(secret))
    await expect(verifyApplicationSession(token, secret)).resolves.toMatchObject({
      sub: "00000000-0000-4000-8000-000000000001",
    })
    await expect(verifyApplicationSession(`${token}x`, secret)).resolves.toBeNull()
  })
})

describe("OIDC transactions", () => {
  it("signs PKCE state and rejects state substitution", async () => {
    process.env.SESSION_SECRET = secret
    const { createAuthTransaction, statesMatch, verifyAuthTransaction } =
      await import("@/lib/auth/oidc")
    const created = await createAuthTransaction("/settings?tab=account")
    expect(created.transaction.state).toHaveLength(43)
    expect(created.transaction.nonce).toHaveLength(43)
    expect(created.transaction.codeVerifier.length).toBeGreaterThanOrEqual(43)
    expect(created.codeChallenge).toHaveLength(43)
    await expect(verifyAuthTransaction(created.token)).resolves.toEqual(created.transaction)
    expect(statesMatch(created.transaction.state, created.transaction.state)).toBe(true)
    expect(
      statesMatch(created.transaction.state, `${created.transaction.state.slice(0, -1)}x`),
    ).toBe(false)
  })
})
