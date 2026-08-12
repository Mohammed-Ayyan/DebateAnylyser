import { z } from "zod"

import type {
  InternalClaimFinding,
  InternalStructureFinding,
  InternalSupportFinding,
  SpanRef,
  StructureEdge,
  StructureRelation,
  ToulminRole,
} from "@/lib/contracts/analysis"

const structureSpanCandidateSchema = z
  .object({
    segment_id: z.string().uuid(),
    start_char: z.number().int().nonnegative(),
    end_char: z.number().int().positive(),
    text: z.string().min(1).max(20_000),
  })
  .strict()

const structureNodeCandidateSchema = z
  .object({
    node_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    role: z.enum(["claim", "data", "warrant", "backing", "qualifier", "rebuttal"]),
    inferred: z.boolean(),
    text: z.string().min(1).max(2_000),
    anchor_span: structureSpanCandidateSchema.nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict()

const structureEdgeCandidateSchema = z
  .object({
    from_node_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    to_node_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    relation: z.enum(["supports", "warrants", "backs", "qualifies", "rebuts"]),
  })
  .strict()

const structureGraphCandidateSchema = z
  .object({
    claim_id: z.string().uuid(),
    state: z.enum(["ok", "insufficient"]),
    reason_code: z.enum(["mapped", "unclear_structure", "model_uncertain"]),
    nodes: z.array(structureNodeCandidateSchema).max(50),
    edges: z.array(structureEdgeCandidateSchema).max(100),
  })
  .strict()

export const structureMappingOutputSchema = z
  .object({ graphs: z.array(structureGraphCandidateSchema).max(50) })
  .strict()

export type StructureMappingOutput = z.infer<typeof structureMappingOutputSchema>

export const structureMappingJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    graphs: {
      type: "array",
      maxItems: 50,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim_id: { type: "string", format: "uuid" },
          state: { type: "string", enum: ["ok", "insufficient"] },
          reason_code: {
            type: "string",
            enum: ["mapped", "unclear_structure", "model_uncertain"],
          },
          nodes: {
            type: "array",
            maxItems: 50,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                node_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
                role: {
                  type: "string",
                  enum: ["claim", "data", "warrant", "backing", "qualifier", "rebuttal"],
                },
                inferred: { type: "boolean" },
                text: { type: "string", minLength: 1, maxLength: 2000 },
                anchor_span: {
                  anyOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        segment_id: { type: "string", format: "uuid" },
                        start_char: { type: "integer", minimum: 0 },
                        end_char: { type: "integer", minimum: 1 },
                        text: { type: "string", minLength: 1, maxLength: 20000 },
                      },
                      required: ["segment_id", "start_char", "end_char", "text"],
                    },
                    { type: "null" },
                  ],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
              required: ["node_id", "role", "inferred", "text", "anchor_span", "confidence"],
            },
          },
          edges: {
            type: "array",
            maxItems: 100,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                from_node_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
                to_node_id: { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" },
                relation: {
                  type: "string",
                  enum: ["supports", "warrants", "backs", "qualifies", "rebuts"],
                },
              },
              required: ["from_node_id", "to_node_id", "relation"],
            },
          },
        },
        required: ["claim_id", "state", "reason_code", "nodes", "edges"],
      },
    },
  },
  required: ["graphs"],
} as const

export type StructureTranscriptSegment = {
  id: string
  index: number
  text: string
  speakerId: string | null
  lowConfidence: boolean
}

export type StructureInput = {
  analysisId: string
  status: "analyzing" | "partial"
  claims: InternalClaimFinding[]
  supports: InternalSupportFinding[]
  segments: StructureTranscriptSegment[]
}

export type StructureCall = {
  claims: InternalClaimFinding[]
  supports: InternalSupportFinding[]
  segments: StructureTranscriptSegment[]
  source: string
}

export type ValidatedStructureNode = {
  tempId: string
  sourceClaimId: string
  role: ToulminRole
  inferred: boolean
  text: string
  state: "ok" | "insufficient"
  span: SpanRef
  anchorRole: "asserted_content" | "inference_context" | "claim_subject"
  confidence: number | null
  personInvolved: boolean
}

export type ValidatedStructureEdge = {
  sourceClaimId: string
  fromTempId: string
  toTempId: string
  relation: StructureRelation
}

export type ValidatedStructureGraph = {
  claimId: string
  nodes: ValidatedStructureNode[]
  edges: ValidatedStructureEdge[]
}

export type StructureMappingRequest = {
  sourceBlock: string
  promptVersion: string
  schemaVersion: string
  maxClaims: number
  maxNodesPerClaim: number
  maxEdgesPerClaim: number
}

export interface StructureMappingProvider {
  map(request: StructureMappingRequest, signal?: AbortSignal): Promise<unknown>
}

export class StructureMappingError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "StructureMappingError"
    this.code = code
    this.retryable = retryable
  }
}

export type PersistedStructureGraph = {
  created: boolean
  findings: InternalStructureFinding[]
  edges: StructureEdge[]
}
