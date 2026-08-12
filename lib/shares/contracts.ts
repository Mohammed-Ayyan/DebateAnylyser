import { z } from "zod"

import {
  analysisOverviewSchema,
  assembledPublicFindingSchema,
  sourceSchema,
  structureEdgeSchema,
} from "@/lib/contracts/analysis"
import { annotationVisibilitySchema } from "@/lib/annotations/contracts"
import { contestStateSchema } from "@/lib/contests/contracts"

export const createShareSchema = z
  .object({ expires_at: z.string().datetime().nullable().optional() })
  .strict()

export const shareSchema = z
  .object({
    id: z.string().uuid(),
    analysis_id: z.string().uuid(),
    status: z.enum(["active", "revoked"]),
    expires_at: z.string().datetime().nullable(),
    revoked_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  })
  .strict()

export const shareListSchema = z.object({ shares: z.array(shareSchema) }).strict()
export const createdShareSchema = z
  .object({ share: shareSchema, token: z.string().min(43).max(43) })
  .strict()

const publicAnnotationSchema = z
  .object({
    finding_id: z.string().uuid().nullable(),
    note: z.string().nullable(),
    visibility: annotationVisibilitySchema,
    highlighted: z.boolean(),
  })
  .strict()
const publicContestSchema = z
  .object({
    finding_id: z.string().uuid(),
    state: contestStateSchema,
    reason: z.string().nullable(),
    resolution: z.string().nullable(),
  })
  .strict()

export const sharedAnalysisSchema = z
  .object({
    analysis_id: z.string().uuid(),
    title: z.string().min(1),
    created_at: z.string().datetime(),
    expires_at: z.string().datetime().nullable(),
    curation_applied: z.boolean(),
    disclosure: z
      .object({
        policy_version: z.string().min(1),
        disclaimer_version: z.string().min(1),
        disclaimer: z.string().min(1),
        limitations_url: z.string().url().startsWith("https://"),
      })
      .strict(),
    analysis: z
      .object({
        overview: analysisOverviewSchema,
        findings: z.array(assembledPublicFindingSchema),
        sources: z.array(sourceSchema),
        structure_edges: z.array(structureEdgeSchema),
      })
      .strict(),
    annotations: z.array(publicAnnotationSchema),
    contests: z.array(publicContestSchema),
  })
  .strict()

export type CreatedShare = z.infer<typeof createdShareSchema>
export type ShareResource = z.infer<typeof shareSchema>
export type SharedAnalysis = z.infer<typeof sharedAnalysisSchema>
