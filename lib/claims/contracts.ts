import { z } from "zod"

import type { ClaimType, InternalClaimFinding } from "@/lib/contracts/analysis"

export const claimCandidateSchema = z.object({
  segment_id: z.string().uuid(),
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().positive(),
  text: z.string().min(1).max(20_000),
  paraphrase: z.boolean(),
  claim_type: z.enum(["factual", "value", "policy", "causal"]),
  check_worthy: z.boolean(),
  extraction_confidence: z.number().min(0).max(1),
})

export const claimExtractionOutputSchema = z.object({
  claims: z.array(claimCandidateSchema).max(100),
})

export const claimExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          segment_id: { type: "string" },
          start_char: { type: "number" },
          end_char: { type: "number" },
          text: { type: "string" },
          paraphrase: { type: "boolean" },
          claim_type: { type: "string", enum: ["factual", "value", "policy", "causal"] },
          check_worthy: { type: "boolean" },
          extraction_confidence: { type: "number" },
        },
        required: [
          "segment_id",
          "start_char",
          "end_char",
          "text",
          "paraphrase",
          "claim_type",
          "check_worthy",
          "extraction_confidence",
        ],
      },
    },
  },
  required: ["claims"],
} as const

export type ClaimCandidate = z.infer<typeof claimCandidateSchema>
export type ClaimExtractionOutput = z.infer<typeof claimExtractionOutputSchema>

export type ClaimTranscriptSegment = {
  id: string
  index: number
  text: string
  speakerId: string | null
  speakerLabel: string | null
  speakerIsNamedPerson: boolean
  lowConfidence: boolean
}

export type ValidatedClaim = {
  segmentId: string
  startChar: number
  endChar: number
  text: string
  paraphrase: boolean
  claimType: ClaimType
  checkWorthy: boolean
  extractionConfidence: number
  speakerId: string | null
  speakerLabel: string | null
  personInvolved: boolean
  sourceLowConfidence: boolean
}

export type ClaimExtractionRequest = {
  sourceBlock: string
  promptVersion: string
  schemaVersion: string
  maxClaims: number
}

export interface ClaimExtractionProvider {
  extract(request: ClaimExtractionRequest, signal?: AbortSignal): Promise<unknown>
}

export class ClaimExtractionError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "ClaimExtractionError"
    this.code = code
    this.retryable = retryable
  }
}

export type PersistedClaimBatch = {
  created: boolean
  findings: InternalClaimFinding[]
}
