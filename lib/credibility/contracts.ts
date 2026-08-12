export const credibilityLevels = ["higher", "mixed", "lower"] as const

export const credibilityFactors = [
  "editorial_standards",
  "ownership_transparency",
  "corrections_practice",
  "method_transparency",
  "source_attribution",
] as const

export type CredibilityLevel = (typeof credibilityLevels)[number]
export type CredibilityFactor = (typeof credibilityFactors)[number]

export type CredibilityMethodProvenance = {
  method_name: string
  rater_reference: string
}

export type CredibilityRating = {
  factor: CredibilityFactor
  level: CredibilityLevel
  provenance: CredibilityMethodProvenance
  contested_note: string
}

export type CredibilityProviderOutput = {
  ratings: CredibilityRating[]
}

export type CredibilityLookupRequest = {
  source_url: string
}

export interface CredibilityProvider {
  assess(
    request: CredibilityLookupRequest,
    signal?: AbortSignal,
  ): Promise<CredibilityProviderOutput>
}
