import { describe, expect, it } from "vitest"

import { toPublicError } from "@/lib/errors/app-error"
import {
  assertRightsGate,
  evaluateRightsGate,
  hostMatches,
  isPrivateOrReservedHost,
} from "@/lib/legal/rights-gate"
import type { LegalPolicy, RightsGateInput } from "@/lib/legal/types"

const policy: LegalPolicy = {
  version: "v1",
  counselApproved: true,
  allowUploads: true,
  allowPaste: true,
  allowedUrlHosts: ["example.com", "*.approved.example"],
  blockedUrlHosts: ["blocked.example"],
  officialApiRequiredHosts: ["video.example"],
}

const upload: RightsGateInput = {
  acceptedUseVersion: "v1",
  source: {
    type: "upload",
    rightsBasis: "owned",
    access: "unknown",
    intendedUse: "education",
  },
}

function urlInput(
  url: string,
  overrides: Partial<RightsGateInput["source"]> = {},
): RightsGateInput {
  return {
    acceptedUseVersion: "v1",
    source: {
      type: "url",
      url,
      rightsBasis: "permission",
      access: "public",
      intendedUse: "research",
      retrievalMethod: "direct_fetch",
      ...overrides,
    },
  }
}

describe("F1a acceptable-use gate", () => {
  it("fails closed until the exact policy is approved and acknowledged", () => {
    expect(evaluateRightsGate({ ...policy, counselApproved: false }, upload)).toMatchObject({
      allowed: false,
      status: 503,
      code: "legal_policy_unavailable",
    })
    expect(evaluateRightsGate(policy, { ...upload, acceptedUseVersion: "old" })).toMatchObject({
      allowed: false,
      status: 403,
      code: "acceptable_use_required",
    })
  })

  it("blocks prohibited person-targeting uses deterministically", () => {
    const decision = evaluateRightsGate(policy, {
      ...upload,
      source: { ...upload.source, intendedUse: "harassment" },
    })
    expect(decision).toMatchObject({ allowed: false, status: 403, code: "acceptable_use" })
  })

  it("requires an explicit rights basis", () => {
    const decision = evaluateRightsGate(policy, {
      ...upload,
      source: { ...upload.source, rightsBasis: "unknown" },
    })
    expect(decision).toMatchObject({ allowed: false, status: 422, code: "rights_blocked" })
  })

  it("allows an approved and authorized upload", () => {
    expect(evaluateRightsGate(policy, upload)).toEqual({ allowed: true, policyVersion: "v1" })
  })
})
describe("F1a URL rights policy", () => {
  it("rejects insecure, private, blocked, unapproved, and non-public URLs", () => {
    const cases = [
      urlInput("http://example.com/watch"),
      urlInput("https://127.0.0.1/watch"),
      urlInput("https://blocked.example/watch"),
      urlInput("https://unknown.example/watch"),
      urlInput("https://example.com/watch", { access: "private" }),
    ]
    for (const input of cases) {
      expect(evaluateRightsGate(policy, input)).toMatchObject({
        allowed: false,
        status: 422,
        code: "rights_blocked",
      })
    }
  })

  it("requires configured official retrieval methods", () => {
    const providerPolicy = { ...policy, allowedUrlHosts: ["video.example"] }
    expect(
      evaluateRightsGate(providerPolicy, urlInput("https://video.example/watch")),
    ).toMatchObject({ allowed: false, code: "rights_blocked" })
    expect(
      evaluateRightsGate(
        providerPolicy,
        urlInput("https://video.example/watch", { retrievalMethod: "official_api" }),
      ),
    ).toEqual({ allowed: true, policyVersion: "v1" })
  })

  it("uses explicit wildcard semantics and recognizes reserved hosts", () => {
    expect(hostMatches("media.approved.example", "*.approved.example")).toBe(true)
    expect(hostMatches("approved.example", "*.approved.example")).toBe(false)
    expect(isPrivateOrReservedHost("localhost")).toBe(true)
    expect(isPrivateOrReservedHost("10.1.2.3")).toBe(true)
    expect(isPrivateOrReservedHost("example.com")).toBe(false)
  })
})

describe("F1a error contract", () => {
  it("exposes only the specific refusal reason and alternative", () => {
    try {
      assertRightsGate(policy, { ...upload, acceptedUseVersion: null })
      throw new Error("Expected the gate to reject")
    } catch (error) {
      expect(toPublicError(error, "correlation-1")).toEqual({
        error: {
          code: "acceptable_use_required",
          message: "The current acceptable-use policy must be acknowledged before analysis.",
          retryable: false,
          correlation_id: "correlation-1",
          details: {
            reason: "The current acceptable-use policy must be acknowledged before analysis.",
            alternative: "Review and accept the current policy at /legal, then retry.",
          },
        },
      })
    }
  })
})
