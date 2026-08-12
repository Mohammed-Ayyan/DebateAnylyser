import { z } from "zod"

import type {
  EvidenceRelation,
  EvidenceSource,
  InternalClaimFinding,
  SourceTier,
} from "@/lib/contracts/analysis"

export const evidenceCandidateSchema = z
  .object({
    url: z.string().url().startsWith("https://"),
    passage: z.string().min(1).max(50_000),
    provenance: z.string().min(1).max(500),
    tier: z.enum(["T1", "T2", "T3"]),
    retrieved_at: z.string().datetime(),
  })
  .strict()

export const evidenceRetrievalOutputSchema = z
  .object({ candidates: z.array(evidenceCandidateSchema).max(20) })
  .strict()

export const evidenceRetrievalJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", format: "uri", pattern: "^https://" },
          passage: { type: "string", minLength: 1, maxLength: 50000 },
          provenance: { type: "string", minLength: 1, maxLength: 500 },
          tier: { type: "string", enum: ["T1", "T2", "T3"] },
          retrieved_at: { type: "string", format: "date-time" },
        },
        required: ["url", "passage", "provenance", "tier", "retrieved_at"],
      },
    },
  },
  required: ["candidates"],
} as const

export const evidenceVerificationOutputSchema = z
  .object({
    relation: z.enum(["supports", "refutes", "neutral", "insufficient"]),
    licensing_quote: z.string().max(20_000).nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict()

export const evidenceVerificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    relation: {
      type: "string",
      enum: ["supports", "refutes", "neutral", "insufficient"],
    },
    licensing_quote: { anyOf: [{ type: "string", maxLength: 20000 }, { type: "null" }] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["relation", "licensing_quote", "confidence"],
} as const

export type EvidenceCandidate = z.infer<typeof evidenceCandidateSchema>
export type EvidenceVerificationOutput = z.infer<typeof evidenceVerificationOutputSchema>

export type EvidenceInput = {
  analysisId: string
  status: "analyzing" | "partial"
  claims: InternalClaimFinding[]
  validSegmentIds: Set<string>
}

export type EvidenceRetrievalRequest = {
  claimId: string
  claimText: string
  maxCandidates: number
}

export interface EvidenceRetriever {
  retrieve(request: EvidenceRetrievalRequest, signal?: AbortSignal): Promise<unknown>
}

export type EvidenceVerificationRequest = {
  sourceBlock: string
  promptVersion: string
  schemaVersion: string
}

export interface EvidenceVerifier {
  verify(request: EvidenceVerificationRequest, signal?: AbortSignal): Promise<unknown>
}

export type ResolvedEvidenceCandidate = EvidenceCandidate & {
  finalUrl: string
  sourceText: string
}

export type VerifiedEvidence = {
  claimId: string
  url: string
  snippet: string
  provenance: string
  tier: SourceTier
  relation: Exclude<EvidenceRelation, "insufficient">
  retrievedAt: Date
  verificationConfidence: number
}

export type PersistedEvidence = {
  created: boolean
  sources: EvidenceSource[]
}

export type SourceResolutionOptions = {
  timeoutMs: number
  maxBytes: number
  maxRedirects: number
}

export interface EvidenceSourceResolver {
  resolve(candidate: EvidenceCandidate, signal?: AbortSignal): Promise<ResolvedEvidenceCandidate>
}

export class EvidenceError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "EvidenceError"
    this.code = code
    this.retryable = retryable
  }
}
