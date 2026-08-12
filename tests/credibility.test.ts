import { describe, expect, it, vi } from "vitest"

import { HttpCredibilityProvider } from "@/lib/credibility/http-provider"
import { toPublicCredibility } from "@/lib/credibility/public-credibility"
import { validateCredibilityProviderOutput } from "@/lib/credibility/validation"

function rating(overrides: Record<string, unknown> = {}) {
  return {
    factor: "editorial_standards",
    level: "higher",
    provenance: {
      method_name: "Published editorial review methodology",
      rater_reference: "Independent Rater A",
    },
    contested_note: "The method's criteria and weighting remain open to dispute.",
    ...overrides,
  }
}

describe("F7 credibility validation", () => {
  it("accepts an empty provider result without inventing a rating", () => {
    expect(validateCredibilityProviderOutput({ ratings: [] })).toEqual({ ratings: [] })
    expect(toPublicCredibility({ ratings: [] })).toEqual({
      ratings: [],
      disagreement: false,
    })
  })

  it("rejects blank method provenance and rater references", () => {
    expect(() =>
      validateCredibilityProviderOutput({
        ratings: [rating({ provenance: { method_name: " ", rater_reference: "Rater" } })],
      }),
    ).toThrow()
    expect(() =>
      validateCredibilityProviderOutput({
        ratings: [rating({ provenance: { method_name: "Method", rater_reference: "  " } })],
      }),
    ).toThrow()
  })

  it("rejects numeric leakage rather than exposing score-like values", () => {
    expect(() =>
      validateCredibilityProviderOutput({
        ratings: [rating({ confidence: 0.91 })],
      }),
    ).toThrow(/numeric/i)
    expect(() =>
      toPublicCredibility({
        ratings: [rating({ provenance: { ...rating().provenance, score: 7 } })],
      }),
    ).toThrow(/numeric/i)
  })
})

describe("F7 public credibility", () => {
  it("derives disagreement only when raters differ on the same factor", () => {
    const result = toPublicCredibility({
      ratings: [
        rating(),
        rating({
          level: "lower",
          provenance: {
            method_name: "Corrections audit",
            rater_reference: "Independent Rater B",
          },
        }),
      ],
    })
    expect(result.disagreement).toBe(true)
    expect(result.ratings.map((item) => item.level)).toEqual(["higher", "lower"])

    expect(
      toPublicCredibility({
        ratings: [rating(), rating({ factor: "ownership_transparency", level: "lower" })],
      }).disagreement,
    ).toBe(false)
  })

  it("returns only the categorical, provenance, contestation, and derived public shape", () => {
    const result = toPublicCredibility({ ratings: [rating()] })
    expect(result).toEqual({
      ratings: [
        {
          factor: "editorial_standards",
          level: "higher",
          provenance: {
            method_name: "Published editorial review methodology",
            rater_reference: "Independent Rater A",
          },
          contested_note: "The method's criteria and weighting remain open to dispute.",
        },
      ],
      disagreement: false,
    })
    expect(JSON.stringify(result)).not.toMatch(/score|confidence|rank/i)
    expect(JSON.stringify(result)).not.toMatch(/\d/)
  })
})

describe("F7 provider-neutral HTTPS adapter", () => {
  it("posts only to the configured endpoint, refuses redirects, and accepts no ratings", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ ratings: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    const provider = new HttpCredibilityProvider({
      endpoint: "https://ratings.example/api/credibility",
      timeoutMs: 5_000,
      fetchImpl,
    })

    await expect(provider.assess({ source_url: "https://source.example/report" })).resolves.toEqual(
      { ratings: [] },
    )

    const [target, init] = fetchImpl.mock.calls[0]
    expect(target).toBe("https://ratings.example/api/credibility")
    expect(init).toMatchObject({ method: "POST", redirect: "error" })
    expect(JSON.parse(String(init?.body))).toEqual({
      source_url: "https://source.example/report",
    })
  })

  it("rejects non-HTTPS configured endpoints", () => {
    expect(
      () =>
        new HttpCredibilityProvider({
          endpoint: "http://127.0.0.1/credibility",
          timeoutMs: 5_000,
        }),
    ).toThrow(/HTTPS/i)
  })
})
