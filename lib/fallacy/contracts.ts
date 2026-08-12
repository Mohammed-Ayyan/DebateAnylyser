import { z } from "zod"

import { FALLACY_TAXONOMY_IDS, FALLACY_TAXONOMY_VERSION } from "./taxonomy"

export const fallacyTaxonomyIdSchema = z.enum(FALLACY_TAXONOMY_IDS)

export const fallacyCandidateSchema = z
  .object({
    taxonomy_id: fallacyTaxonomyIdSchema,
    segment_id: z.string().uuid(),
    start_char: z.number().int().nonnegative(),
    end_char: z.number().int().positive(),
    text: z.string().min(1).max(20_000),
    framing: z.literal("possible"),
    person_involved: z.boolean(),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export const fallacyDetectionOutputSchema = z
  .object({
    taxonomy_version: z.literal(FALLACY_TAXONOMY_VERSION),
    findings: z.array(fallacyCandidateSchema).max(50),
  })
  .strict()

export const fallacyDetectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    taxonomy_version: { type: "string", enum: [FALLACY_TAXONOMY_VERSION] },
    findings: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          taxonomy_id: { type: "string", enum: FALLACY_TAXONOMY_IDS },
          segment_id: { type: "string", format: "uuid" },
          start_char: { type: "integer", minimum: 0 },
          end_char: { type: "integer", minimum: 1 },
          text: { type: "string", minLength: 1, maxLength: 20_000 },
          framing: { type: "string", enum: ["possible"] },
          person_involved: { type: "boolean" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },

        required: [
          "taxonomy_id",
          "segment_id",
          "start_char",
          "end_char",
          "text",
          "framing",
          "person_involved",
          "confidence",
        ],
      },
    },
  },
  required: ["taxonomy_version", "findings"],
} as const

export type FallacyCandidate = z.infer<typeof fallacyCandidateSchema>
export type FallacyDetectionOutput = z.infer<typeof fallacyDetectionOutputSchema>

export type FallacyTranscriptSegment = Readonly<{
  id: string
  text: string
  lowConfidence: boolean
  personInvolved: boolean
}>

export type ValidatedFallacyFinding = Readonly<{
  taxonomyId: FallacyCandidate["taxonomy_id"]
  taxonomyVersion: typeof FALLACY_TAXONOMY_VERSION
  category: "logical_fallacy" | "rhetoric" | "misleading_or_incomplete"
  possibleType: string
  why: string
  span: Readonly<{
    segmentId: string
    startChar: number
    endChar: number
    text: string
  }>
  confidenceBand: "high" | "medium"
  caveat: string | null
  contestable: true
  personInvolved: false
}>

export type FallacyDetectionResult = Readonly<{
  taxonomyVersion: typeof FALLACY_TAXONOMY_VERSION
  findings: readonly ValidatedFallacyFinding[]
  message: string | null
}>

export type ValidateFallacyOptions = Readonly<{
  precisionThreshold?: number
  maxFindings?: number
}>

export type FallacyDetectionRequest = Readonly<{
  sourceBlock: string
  promptVersion: string
  schemaVersion: string
  maxFindings: number
}>

export interface FallacyDetectionProvider {
  detect(request: FallacyDetectionRequest, signal?: AbortSignal): Promise<unknown>
}

export class FallacyDetectionError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "FallacyDetectionError"
    this.code = code
    this.retryable = retryable
  }
}

export class FallacyValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "FallacyValidationError"
    this.code = code
  }
}
