import { describe, expect, it } from "vitest"

import { DatasetCredibilityProvider } from "@/lib/credibility/dataset-provider"
import { TRANSPARENT_DOMAIN_DATASET } from "@/lib/credibility/domain-dataset"
import { toPublicCredibility } from "@/lib/credibility/public-credibility"
import { validateCredibilityProviderOutput } from "@/lib/credibility/validation"

describe("Dataset Credibility Provider", () => {
  const provider = new DatasetCredibilityProvider()

  it("rates Wikipedia domains with categorical editorial and governance factors", async () => {
    const result = await provider.assess({
      source_url: "https://en.wikipedia.org/wiki/Alan_Turing",
    })

    expect(result.ratings.length).toBeGreaterThan(0)
    const factors = result.ratings.map((r) => r.factor)
    expect(factors).toContain("editorial_standards")
    expect(factors).toContain("ownership_transparency")
    expect(factors).toContain("corrections_practice")

    for (const rating of result.ratings) {
      expect(["higher", "mixed", "lower"]).toContain(rating.level)
      expect(rating.provenance.method_name.trim().length).toBeGreaterThan(0)
      expect(rating.provenance.rater_reference.trim().length).toBeGreaterThan(0)
      expect(rating.contested_note.trim().length).toBeGreaterThan(0)
    }
  })

  it("rates governmental and academic domains with institutional review factors", async () => {
    const govResult = await provider.assess({
      source_url: "https://data.gov/reports/annual",
    })
    expect(govResult.ratings.length).toBeGreaterThan(0)
    expect(govResult.ratings.some((r) => r.factor === "source_attribution")).toBe(true)

    const eduResult = await provider.assess({
      source_url: "https://oxford.ac.uk/research/study",
    })
    expect(eduResult.ratings.length).toBeGreaterThan(0)
    expect(eduResult.ratings.some((r) => r.factor === "editorial_standards")).toBe(true)
  })

  it("rates established press and wire organizations", async () => {
    const reutersResult = await provider.assess({
      source_url: "https://www.reuters.com/world/article",
    })
    expect(reutersResult.ratings.length).toBeGreaterThan(0)
    expect(reutersResult.ratings.some((r) => r.factor === "editorial_standards")).toBe(true)

    const bbcResult = await provider.assess({
      source_url: "https://www.bbc.co.uk/news/technology",
    })
    expect(bbcResult.ratings.length).toBeGreaterThan(0)
  })

  it("returns an empty rating list for unlisted / unknown domains (insufficient data)", async () => {
    const unknownResult = await provider.assess({
      source_url: "https://unknown-random-blog-domain.xyz/post",
    })
    expect(unknownResult).toEqual({ ratings: [] })

    // Public shape also reflects insufficient data without inventing ratings
    const publicShape = toPublicCredibility(unknownResult)
    expect(publicShape.ratings).toEqual([])
    expect(publicShape.disagreement).toBe(false)
  })

  it("strictly enforces NO numeric values or digits anywhere in credibility outputs", async () => {
    const result = await provider.assess({
      source_url: "https://en.wikipedia.org/wiki/Debate",
    })

    // 1. Zod validator passes (no numeric types)
    expect(() => validateCredibilityProviderOutput(result)).not.toThrow()

    // 2. String representation contains NO digits 0-9
    const json = JSON.stringify(result)
    expect(json).not.toMatch(/\d/)
    expect(json).not.toMatch(/score|confidence|rank|points/i)
  })

  it("rejects invalid, non-HTTPS, or empty source URLs", async () => {
    await expect(
      provider.assess({ source_url: "http://insecure.example.com" }),
    ).rejects.toMatchObject({ code: "CREDIBILITY_REQUEST_INVALID" })

    await expect(provider.assess({ source_url: "not-a-url" })).rejects.toMatchObject({
      code: "CREDIBILITY_REQUEST_INVALID",
    })
  })

  it("verifies the entire static transparent dataset is digit-free and fully valid", () => {
    const json = JSON.stringify(TRANSPARENT_DOMAIN_DATASET)
    expect(json).not.toMatch(/\d/)
    for (const record of TRANSPARENT_DOMAIN_DATASET) {
      expect(() => validateCredibilityProviderOutput({ ratings: record.ratings })).not.toThrow()
    }
  })
})
