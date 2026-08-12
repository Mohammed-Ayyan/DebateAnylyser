import { z } from "zod"

import { analysisStatusSchema } from "@/lib/contracts/analysis"

export const historySourceTypeSchema = z.enum(["upload", "url", "paste"])
export const historyRetentionSettingSchema = z.enum(["keep", "30d", "90d", "delete_on_complete"])

export const historyListQuerySchema = z
  .object({
    query: z.string().trim().max(200).optional(),
    status: analysisStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict()

export const historyListItemSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(200),
    status: analysisStatusSchema,
    source_type: historySourceTypeSchema,
    retention_setting: historyRetentionSettingSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict()

export const historyListResponseSchema = z
  .object({
    items: z.array(historyListItemSchema),
    next_cursor: z.string().nullable(),
  })
  .strict()

const controlCharacterPattern = /\p{Cc}/u

export const historyPatchBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((title) => !controlCharacterPattern.test(title), "Title contains control characters"),
    retention_setting: historyRetentionSettingSchema,
  })
  .partial()
  .strict()
  .refine((body) => body.title !== undefined || body.retention_setting !== undefined, {
    message: "At least one field is required",
  })

export const historyResumeResponseSchema = z.object({ status: analysisStatusSchema }).strict()

export type HistoryListQuery = z.infer<typeof historyListQuerySchema>
export type HistoryListItem = z.infer<typeof historyListItemSchema>
export type HistoryListResponse = z.infer<typeof historyListResponseSchema>
export type HistoryPatchBody = z.infer<typeof historyPatchBodySchema>
export type HistoryResumeResponse = z.infer<typeof historyResumeResponseSchema>
