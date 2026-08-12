import { z } from "zod"

export const timelinePointSchema = z
  .object({
    time_ms: z.number().int().nonnegative(),
    finding_id: z.string().uuid(),
  })
  .strict()

export const timelineResponseSchema = z
  .object({
    points: z.array(timelinePointSchema),
  })
  .strict()

export const timelineSpanInputSchema = z
  .object({
    segment_id: z.string().uuid(),
    start_char: z.number().int().nonnegative(),
    end_char: z.number().int().positive(),
  })
  .strict()
  .refine((span) => span.end_char > span.start_char, "end_char must exceed start_char")

export const timelineFindingInputSchema = z
  .object({
    id: z.string().uuid(),
    span_refs: z.array(timelineSpanInputSchema),
  })
  .strict()

export const timelineSegmentInputSchema = z
  .object({
    id: z.string().uuid(),
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().nonnegative(),
    text: z.string(),
  })
  .strict()
  .refine((segment) => segment.end_ms >= segment.start_ms, "end_ms must not precede start_ms")

export type TimelinePoint = z.infer<typeof timelinePointSchema>
export type TimelineResponse = z.infer<typeof timelineResponseSchema>
export type TimelineSpanInput = z.infer<typeof timelineSpanInputSchema>
export type TimelineFindingInput = z.infer<typeof timelineFindingInputSchema>
export type TimelineSegmentInput = z.infer<typeof timelineSegmentInputSchema>
