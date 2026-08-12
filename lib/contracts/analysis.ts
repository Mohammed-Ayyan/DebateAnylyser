import { z } from "zod"

export const analysisStatusSchema = z.enum([
  "queued",
  "transcribing",
  "analyzing",
  "partial",
  "complete",
  "failed",
])
export const pipelineStageSchema = z.enum([
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
])
export const stageStatusSchema = z.enum(["pending", "running", "complete", "failed", "skipped"])
export const confidenceBandSchema = z.enum(["high", "medium", "low", "insufficient"])
export const findingStateSchema = z.enum(["ok", "insufficient", "contested"])
export const findingKindSchema = z.enum(["claim", "support", "structure", "fallacy", "credibility"])
export const claimTypeSchema = z.enum(["factual", "value", "policy", "causal"])
export const claimDetailSchema = z.object({
  claim_type: claimTypeSchema,
  check_worthy: z.boolean(),
  speaker_id: z.string().uuid().nullable(),
  speaker_label: z.string().min(1).nullable(),
})
export const supportLevelSchema = z.enum(["present", "weak", "absent"])
export const supportReasonCodeSchema = z.enum([
  "explicit_support",
  "limited_support",
  "no_support_found",
  "speaker_unattributed",
  "attribution_uncertain",
  "context_incomplete",
  "model_uncertain",
])
export const supportDetailSchema = z.object({
  claim_id: z.string().uuid(),
  support_level: supportLevelSchema.nullable(),
  rationale: z.string().min(1),
  reason_code: supportReasonCodeSchema,
  anchor_role: z.enum(["support_evidence", "claim_subject"]),
})
export const toulminRoleSchema = z.enum([
  "claim",
  "data",
  "warrant",
  "backing",
  "qualifier",
  "rebuttal",
])
export const structureRelationSchema = z.enum([
  "supports",
  "warrants",
  "backs",
  "qualifies",
  "rebuts",
])
export const structureDetailSchema = z.object({
  source_claim_id: z.string().uuid(),
  role: toulminRoleSchema,
  inferred: z.boolean(),
  anchor_role: z.enum(["asserted_content", "inference_context", "claim_subject"]),
})
export const structureEdgeSchema = z.object({
  id: z.string().uuid(),
  analysis_id: z.string().uuid(),
  from_finding_id: z.string().uuid(),
  to_finding_id: z.string().uuid(),
  relation: structureRelationSchema,
})

export const spanRefSchema = z
  .object({
    segment_id: z.string().uuid(),
    start_char: z.number().int().nonnegative(),
    end_char: z.number().int().positive(),
  })
  .refine((span) => span.end_char > span.start_char, "end_char must exceed start_char")

export const internalConfidenceSchema = z.object({
  raw: z.number().min(0).max(1),
  signals: z.record(z.string(), z.unknown()).optional(),
})

export const sourceTierSchema = z.enum(["T1", "T2", "T3"])
export const evidenceRelationSchema = z.enum(["supports", "refutes", "neutral", "insufficient"])
export const credibilityLevelSchema = z.enum(["higher", "mixed", "lower"])
export const credibilityFactorSchema = z.enum([
  "editorial_standards",
  "ownership_transparency",
  "corrections_practice",
  "method_transparency",
  "source_attribution",
])
export const credibilityRatingSchema = z
  .object({
    id: z.string().uuid(),
    factor: credibilityFactorSchema,
    level: credibilityLevelSchema,
    method_provenance: z.string().trim().min(1),
    rater_ref: z.string().trim().min(1),
    contested: z.literal(true),
  })
  .strict()
export const sourceSchema = z
  .object({
    id: z.string().uuid(),
    analysis_id: z.string().uuid(),
    url: z.string().url().startsWith("https://"),
    retrieved_snippet: z.string().min(1),
    provenance: z.string().min(1),
    tier: sourceTierSchema,
    resolves: z.literal(true),
    supports_relation: evidenceRelationSchema.exclude(["insufficient"]),
    licensing_quote_verified: z.literal(true),
    retrieved_at: z.string().datetime(),
    credibility_ratings: z.array(credibilityRatingSchema).optional(),
    credibility_disagreement: z.boolean().optional(),
  })
  .strict()

export const fallacyDetailSchema = z
  .object({
    source_claim_id: z.string().uuid(),
    possible_type: z.string().startsWith("Possible "),
    taxonomy_ref: z.string().min(1),
    why: z.string().min(1),
    caveat: z.string().min(1).nullable(),
    contestable: z.literal(true),
  })
  .strict()
export const credibilityDetailSchema = z.object({ source_id: z.string().uuid() }).strict()

export const internalFindingSchema = z.object({
  id: z.string().uuid(),
  analysis_id: z.string().uuid(),
  kind: findingKindSchema,
  text: z.string().min(1),
  paraphrase: z.boolean().default(false),
  confidence: internalConfidenceSchema.optional(),
  confidence_band: confidenceBandSchema.nullable(),
  state: findingStateSchema,
  person_involved: z.boolean(),
  span_refs: z.array(spanRefSchema),
  evidence_refs: z.array(z.string().uuid()),
  produced_by_stage: z.enum(["S2", "S3", "S4", "S5", "S6", "S7", "S8"]),
  claim: claimDetailSchema.optional(),
  support: supportDetailSchema.optional(),
  structure: structureDetailSchema.optional(),
  fallacy: fallacyDetailSchema.optional(),
  credibility: credibilityDetailSchema.optional(),
})

export const publicFindingSchema = internalFindingSchema.omit({ confidence: true })
export const assembledPublicFindingSchema = publicFindingSchema
  .extend({ confidence_band: confidenceBandSchema })
  .strict()
export const internalClaimFindingSchema = internalFindingSchema.extend({
  kind: z.literal("claim"),
  produced_by_stage: z.literal("S2"),
  span_refs: z.array(spanRefSchema).min(1),
  evidence_refs: z.array(z.string().uuid()),
  claim: claimDetailSchema,
})
export const publicClaimFindingSchema = internalClaimFindingSchema.omit({ confidence: true })
export const internalSupportFindingSchema = internalFindingSchema.extend({
  kind: z.literal("support"),
  produced_by_stage: z.literal("S3"),
  span_refs: z.array(spanRefSchema).min(1),
  evidence_refs: z.array(z.string().uuid()).length(0),
  support: supportDetailSchema,
})
export const publicSupportFindingSchema = internalSupportFindingSchema.omit({ confidence: true })
export const internalStructureFindingSchema = internalFindingSchema.extend({
  kind: z.literal("structure"),
  produced_by_stage: z.literal("S4"),
  span_refs: z.array(spanRefSchema).min(1),
  evidence_refs: z.array(z.string().uuid()).length(0),
  structure: structureDetailSchema,
})
export const publicStructureFindingSchema = internalStructureFindingSchema.omit({
  confidence: true,
})
export const internalFallacyFindingSchema = internalFindingSchema.extend({
  kind: z.literal("fallacy"),
  produced_by_stage: z.literal("S5"),
  span_refs: z.array(spanRefSchema).min(1),
  evidence_refs: z.array(z.string().uuid()).length(0),
  person_involved: z.literal(false),
  fallacy: fallacyDetailSchema,
})
export const publicFallacyFindingSchema = internalFallacyFindingSchema.omit({ confidence: true })
export const internalCredibilityFindingSchema = internalFindingSchema.extend({
  kind: z.literal("credibility"),
  produced_by_stage: z.literal("S7"),
  span_refs: z.array(spanRefSchema).length(0),
  evidence_refs: z.array(z.string().uuid()).min(1),
  person_involved: z.literal(false),
  credibility: credibilityDetailSchema,
})
export const publicCredibilityFindingSchema = internalCredibilityFindingSchema.omit({
  confidence: true,
})

export const overviewReadSchema = z.enum([
  "external_evidence_available",
  "transcript_anchored",
  "limited_coverage",
  "insufficient",
])
export const analysisOverviewSchema = z
  .object({
    categorical_read: overviewReadSchema,
    distribution: z
      .object({
        claims: z.number().int().nonnegative(),
        support_present: z.number().int().nonnegative(),
        support_weak: z.number().int().nonnegative(),
        support_absent: z.number().int().nonnegative(),
        support_insufficient: z.number().int().nonnegative(),
        verified_sources: z.number().int().nonnegative(),
        possible_patterns: z.number().int().nonnegative(),
      })
      .strict(),
    top_insight: z.string().min(1),
    explore_pointers: z.array(
      z
        .object({
          finding_id: z.string().uuid(),
          reason: z.enum(["claim_context", "speaker_support", "external_evidence"]),
        })
        .strict(),
    ),
  })
  .strict()
export const publicStageRunSchema = z
  .object({
    stage: pipelineStageSchema,
    status: stageStatusSchema,
    attempt: z.number().int().positive(),
    error_class: z.string().nullable(),
  })
  .strict()
export const assembledAnalysisSchema = z
  .object({
    overview: analysisOverviewSchema,
    findings: z.array(assembledPublicFindingSchema),
    sources: z.array(sourceSchema),
    structure_edges: z.array(structureEdgeSchema),
    stage_runs: z.array(publicStageRunSchema),
  })
  .strict()
export const publicAnalysisResourceSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    status: analysisStatusSchema,
    source_type: z.enum(["upload", "url", "paste"]),
    language: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    assembly_ready: z.boolean(),
    overview: analysisOverviewSchema.nullable(),
    findings: z.array(assembledPublicFindingSchema),
    sources: z.array(sourceSchema),
    structure_edges: z.array(structureEdgeSchema),
    stage_runs: z.array(publicStageRunSchema),
  })
  .strict()

export type AnalysisStatus = z.infer<typeof analysisStatusSchema>
export type AnalysisOverview = z.infer<typeof analysisOverviewSchema>
export type OverviewRead = z.infer<typeof overviewReadSchema>
export type AssembledPublicFinding = z.infer<typeof assembledPublicFindingSchema>
export type AssembledAnalysis = z.infer<typeof assembledAnalysisSchema>
export type PublicAnalysisResource = z.infer<typeof publicAnalysisResourceSchema>
export type PublicStageRun = z.infer<typeof publicStageRunSchema>
export type PipelineStage = z.infer<typeof pipelineStageSchema>
export type StageStatus = z.infer<typeof stageStatusSchema>
export type InternalFinding = z.infer<typeof internalFindingSchema>
export type PublicFinding = z.infer<typeof publicFindingSchema>
export type InternalClaimFinding = z.infer<typeof internalClaimFindingSchema>
export type PublicClaimFinding = z.infer<typeof publicClaimFindingSchema>
export type InternalSupportFinding = z.infer<typeof internalSupportFindingSchema>
export type PublicSupportFinding = z.infer<typeof publicSupportFindingSchema>
export type InternalStructureFinding = z.infer<typeof internalStructureFindingSchema>
export type PublicStructureFinding = z.infer<typeof publicStructureFindingSchema>
export type InternalFallacyFinding = z.infer<typeof internalFallacyFindingSchema>
export type PublicFallacyFinding = z.infer<typeof publicFallacyFindingSchema>
export type InternalCredibilityFinding = z.infer<typeof internalCredibilityFindingSchema>
export type PublicCredibilityFinding = z.infer<typeof publicCredibilityFindingSchema>
export type CredibilityRating = z.infer<typeof credibilityRatingSchema>
export type CredibilityLevel = z.infer<typeof credibilityLevelSchema>
export type CredibilityFactor = z.infer<typeof credibilityFactorSchema>
export type StructureEdge = z.infer<typeof structureEdgeSchema>
export type ClaimType = z.infer<typeof claimTypeSchema>
export type SupportLevel = z.infer<typeof supportLevelSchema>
export type SupportReasonCode = z.infer<typeof supportReasonCodeSchema>
export type ToulminRole = z.infer<typeof toulminRoleSchema>
export type StructureRelation = z.infer<typeof structureRelationSchema>
export type SourceTier = z.infer<typeof sourceTierSchema>
export type EvidenceRelation = z.infer<typeof evidenceRelationSchema>
export type EvidenceSource = z.infer<typeof sourceSchema>
export type SpanRef = z.infer<typeof spanRefSchema>
