import { z } from "zod"

import { credibilityFactors, credibilityLevels } from "./contracts"

const methodProvenanceSchema = z
  .object({
    method_name: z.string().trim().min(1).max(500),
    rater_reference: z.string().trim().min(1).max(2_000),
  })
  .strict()

export const credibilityRatingSchema = z
  .object({
    factor: z.enum(credibilityFactors),
    level: z.enum(credibilityLevels),
    provenance: methodProvenanceSchema,
    contested_note: z.string().trim().min(1).max(2_000),
  })
  .strict()

const providerOutputShapeSchema = z
  .object({
    ratings: z.array(credibilityRatingSchema).max(100),
  })
  .strict()

function containsNumber(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "number") return true
  if (value === null || typeof value !== "object") return false
  if (seen.has(value)) return false
  seen.add(value)
  return Object.values(value).some((item) => containsNumber(item, seen))
}

export const credibilityProviderOutputSchema = z
  .unknown()
  .superRefine((value, context) => {
    if (containsNumber(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Credibility output must not contain numeric values.",
      })
    }
  })
  .pipe(providerOutputShapeSchema)

export const credibilityLookupRequestSchema = z
  .object({
    source_url: z.string().trim().url().startsWith("https://").max(4_000),
  })
  .strict()

export function validateCredibilityProviderOutput(
  value: unknown,
): z.infer<typeof credibilityProviderOutputSchema> {
  return credibilityProviderOutputSchema.parse(value)
}
