import { describe, expect, it } from "vitest"

import { isAnalysisOwner } from "@/lib/authz/ownership"
import type { ConsumeResult, RateLimitBackend, StreamLease } from "@/lib/rate-limit/backend"
import { enforceRateLimit } from "@/lib/rate-limit/limiter"

class FakeBackend implements RateLimitBackend {
  constructor(private readonly result: ConsumeResult) {}

  consume(): Promise<ConsumeResult> {
    return Promise.resolve(this.result)
  }

  acquireLease(): Promise<StreamLease | null> {
    return Promise.resolve(null)
  }
}

describe("deny-by-default ownership", () => {
  const ownerId = "00000000-0000-4000-8000-000000000001"

  it("allows only the matching authenticated owner", () => {
    expect(isAnalysisOwner({ kind: "anonymous" }, ownerId)).toBe(false)
    expect(isAnalysisOwner({ kind: "share", shareId: "s", analysisId: "a" }, ownerId)).toBe(false)
    expect(
      isAnalysisOwner(
        {
          kind: "authenticated",
          userId: "different",
          email: "user@example.com",
          providerRef: "issuer#subject",
          authMethod: "session",
        },
        ownerId,
      ),
    ).toBe(false)
  })
})

describe("rate-limit enforcement", () => {
  it("returns a typed 429 with retry timing when the atomic backend denies", async () => {
    const backend = new FakeBackend({ allowed: false, remaining: 0, retryAfterSeconds: 37 })
    await expect(enforceRateLimit("B", "subject", backend)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
      details: { retryAfterSeconds: 37 },
    })
  })

  it("allows a request accepted by the backend", async () => {
    const backend = new FakeBackend({ allowed: true, remaining: 2, retryAfterSeconds: 10 })
    await expect(enforceRateLimit("C", "subject", backend)).resolves.toBeUndefined()
  })
})
