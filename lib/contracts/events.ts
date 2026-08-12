import { z } from "zod"

import {
  pipelineStageSchema,
  analysisOverviewSchema,
  publicFindingSchema,
  stageStatusSchema,
  structureEdgeSchema,
} from "./analysis"

export const analysisEventTypeSchema = z.enum([
  "transcript.ready",
  "finding.batch",
  "overview.ready",
  "stage.status",
  "analysis.done",
  "error",
])

export const analysisEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.ready"), transcript_id: z.string().uuid() }),
  z.object({
    type: z.literal("finding.batch"),
    stage: pipelineStageSchema,
    findings: z.array(publicFindingSchema),
    structure_edges: z.array(structureEdgeSchema).optional(),
  }),
  z.object({
    type: z.literal("overview.ready"),
    overview: analysisOverviewSchema,
  }),
  z.object({
    type: z.literal("stage.status"),
    stage: pipelineStageSchema,
    status: stageStatusSchema,
    attempt: z.number().int().positive(),
    error_class: z.string().optional(),
  }),
  z.object({ type: z.literal("analysis.done"), status: z.enum(["complete", "partial", "failed"]) }),
  z.object({
    type: z.literal("error"),
    code: z.string().min(1),
    message: z.string().min(1),
    reconcile_required: z.boolean().optional(),
  }),
])

export type AnalysisEvent = z.infer<typeof analysisEventSchema>
