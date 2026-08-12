import { SignJWT } from "jose"
import { NextRequest } from "next/server"
import { beforeAll, describe, expect, it } from "vitest"

import { proxy } from "@/proxy"

const secret = "proxy-auth-test-session-secret-at-least-32-characters"
const encoder = new TextEncoder()

beforeAll(() => {
  process.env.SESSION_SECRET = secret
  process.env.SESSION_COOKIE_NAME = "debate_session"
})

async function sessionCookie() {
  const token = await new SignJWT({ email: "user@example.test" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-4000-8000-000000000001")
    .setIssuer("debate-analyser")
    .setAudience("debate-analyser-web")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encoder.encode(secret))
  return `debate_session=${token}`
}

describe("protected route proxy", () => {
  it("redirects anonymous users and preserves path plus query", async () => {
    const response = await proxy(new NextRequest("https://app.example/history?status=complete"))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "https://app.example/auth/signin?return_to=%2Fhistory%3Fstatus%3Dcomplete",
    )
  })

  it("allows a valid application session", async () => {
    const response = await proxy(
      new NextRequest("https://app.example/settings", {
        headers: { cookie: await sessionCookie() },
      }),
    )
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("redirects authenticated users away from public auth screens", async () => {
    const response = await proxy(
      new NextRequest("https://app.example/auth/signin", {
        headers: { cookie: await sessionCookie() },
      }),
    )
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://app.example/dashboard")
  })

  it("rejects an expired session", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("00000000-0000-4000-8000-000000000001")
      .setIssuer("debate-analyser")
      .setAudience("debate-analyser-web")
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(encoder.encode(secret))
    const response = await proxy(
      new NextRequest("https://app.example/dashboard", {
        headers: { cookie: `debate_session=${token}` },
      }),
    )
    expect(response.headers.get("location")).toContain("/auth/signin")
  })
})
