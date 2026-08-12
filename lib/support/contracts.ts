import { z } from "zod"

import type {
  InternalClaimFinding,
  InternalSupportFinding,
  SpanRef,
  SupportLevel,
  SupportReasonCode,
} from "@/lib/contracts/analysis"

const supportSpanCandidateSchema = z
  .object({
    segment_id: z.string().uuid(),
    start_char: z.number().int().nonnegative(),
    end_char: z.number().int().positive(),
    text: z.string().min(1).max(20_000),
  })
  .strict()

export const supportAssessmentCandidateSchema = z
  .object({
    claim_id: z.string().uuid(),
    state: z.enum(["ok", "insufficient"]),
    support_level: z.enum(["present", "weak", "absent"]).nullable(),
    evidence_spans: z.array(supportSpanCandidateSchema).max(50),
    assessment_confidence: z.number().min(0).max(1),
    reason_code: z.enum([
      "explicit_support",
      "limited_support",
      "no_support_found",
      "model_uncertain",
    ]),
  })
  .strict()

export const supportAssessmentOutputSchema = z
  .object({
    assessments: z.array(supportAssessmentCandidateSchema).max(100),
  })
  .strict()

export const supportAssessmentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessments: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim_id: { type: "string", format: "uuid" },
          state: { type: "string", enum: ["ok", "insufficient"] },
          support_level: {
            anyOf: [{ type: "string", enum: ["present", "weak", "absent"] }, { type: "null" }],
          },
          evidence_spans: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                segment_id: { type: "string", format: "uuid" },
                start_char: { type: "integer", minimum: 0 },
                end_char: { type: "integer", minimum: 1 },
                text: { type: "string" },
              },
              required: ["segment_id", "start_char", "end_char", "text"],
            },
          },
          assessment_confidence: { type: "number", minimum: 0, maximum: 1 },
          reason_code: {
            type: "string",
            enum: ["explicit_support", "limited_support", "no_support_found", "model_uncertain"],
          },
        },
        required: [
          "claim_id",
          "state",
          "support_level",
          "evidence_spans",
          "assessment_confidence",
          "reason_code",
        ],
      },
    },
  },
  required: ["assessments"],
} as const

export type SupportAssessmentOutput = z.infer<typeof supportAssessmentOutputSchema>

export type SupportTranscriptSegment = {
  id: string
  index: number
  text: string
  speakerId: string | null
  lowConfidence: boolean
}

export type SupportInput = {
  analysisId: string
  status: "analyzing" | "partial"
  claims: InternalClaimFinding[]
  segments: SupportTranscriptSegment[]
}

export type ValidatedSupport = {
  claimId: string
  supportLevel: SupportLevel | null
  state: "ok" | "insufficient"
  reasonCode: SupportReasonCode
  rationale: string
  spans: SpanRef[]
  assessmentConfidence: number | null
  personInvolved: boolean
  coverageComplete: boolean
  sourceLowConfidence: boolean
}

export type SupportAssessmentRequest = {
  sourceBlock: string
  promptVersion: string
  schemaVersion: string
  maxClaims: number
}

export interface SupportAssessmentProvider {
  assess(request: SupportAssessmentRequest, signal?: AbortSignal): Promise<unknown>
}

export class SupportAssessmentError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "SupportAssessmentError"
    this.code = code
    this.retryable = retryable
  }
}

export type PersistedSupportBatch = {
  created: boolean
  findings: InternalSupportFinding[]
}
