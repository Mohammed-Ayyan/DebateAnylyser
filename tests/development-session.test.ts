import { describe, expect, it } from "vitest"

import { isDevelopmentSessionAllowed } from "@/lib/auth/development-session"

describe("development session gate", () => {
  it("allows only the explicit development application environment", () => {
    expect(isDevelopmentSessionAllowed("dev")).toBe(true)
  })

  it.each(["staging", "prod", undefined] as const)("fails closed for %s", (environment) => {
    expect(isDevelopmentSessionAllowed(environment)).toBe(false)
  })
})
