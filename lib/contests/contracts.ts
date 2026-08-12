import { z } from "zod"

export const contestStateSchema = z.enum([
  "open",
  "acknowledged",
  "resolved_valid",
  "resolved_invalid",
])
export const createContestSchema = z
  .object({ reason: z.string().trim().min(1).max(2_000).optional() })
  .strict()
export const contestSchema = z
  .object({
    id: z.string().uuid(),
    finding_id: z.string().uuid(),
    reason: z.string().nullable(),
    state: contestStateSchema,
    resolution: z.string().nullable(),
    resolved_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict()
export const contestReceiptSchema = z
  .object({
    contest: contestSchema,
    finding_state: z.literal("contested"),
    acknowledgement: z.literal("recorded_for_review"),
  })
  .strict()
export const contestListSchema = z.object({ contests: z.array(contestSchema) }).strict()

export type Contest = z.infer<typeof contestSchema>
