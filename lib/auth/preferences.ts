import { z } from "zod"

import { retentionSettingSchema } from "@/lib/privacy/contracts"

export const accessibilityPreferencesSchema = z
  .object({
    reduced_motion: z.boolean().optional(),
    high_contrast: z.boolean().optional(),
    screen_reader_optimized: z.boolean().optional(),
  })
  .strict()

export const updatePreferencesSchema = z
  .object({
    confidence_display: z.literal("categorical").optional(),
    jargon_plain_language: z.boolean().optional(),
    reading_density: z.enum(["comfortable", "low_density"]).optional(),
    accessibility_prefs: accessibilityPreferencesSchema.optional(),
    default_retention_setting: retentionSettingSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one preference is required")

export type PreferenceUpdate = z.infer<typeof updatePreferencesSchema>
