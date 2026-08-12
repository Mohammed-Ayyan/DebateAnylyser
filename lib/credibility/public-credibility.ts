import type { CredibilityFactor, CredibilityLevel, CredibilityRating } from "./contracts"
import { validateCredibilityProviderOutput } from "./validation"

export type PublicCredibilityRating = {
  factor: CredibilityFactor
  level: CredibilityLevel
  provenance: {
    method_name: string
    rater_reference: string
  }
  contested_note: string
}

export type PublicCredibility = {
  ratings: PublicCredibilityRating[]
  disagreement: boolean
}

export function deriveCredibilityDisagreement(ratings: readonly CredibilityRating[]): boolean {
  const levelsByFactor = new Map<CredibilityFactor, Set<CredibilityLevel>>()
  for (const rating of ratings) {
    const levels = levelsByFactor.get(rating.factor) ?? new Set<CredibilityLevel>()
    levels.add(rating.level)
    levelsByFactor.set(rating.factor, levels)
  }
  return [...levelsByFactor.values()].some((levels) => levels.size > 1)
}

export function toPublicCredibility(value: unknown): PublicCredibility {
  const validated = validateCredibilityProviderOutput(value)
  const ratings = validated.ratings.map((rating) => ({
    factor: rating.factor,
    level: rating.level,
    provenance: {
      method_name: rating.provenance.method_name,
      rater_reference: rating.provenance.rater_reference,
    },
    contested_note: rating.contested_note,
  }))

  return {
    ratings,
    disagreement: deriveCredibilityDisagreement(validated.ratings),
  }
}
