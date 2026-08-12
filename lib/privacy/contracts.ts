import { z } from "zod"

export const retentionSettingSchema = z.enum(["keep", "30d", "90d", "delete_on_complete"])

export const deletionAcceptedSchema = z
  .object({
    status: z.literal("accepted"),
  })
  .strict()

export type RetentionSetting = z.infer<typeof retentionSettingSchema>
export type DeletionAccepted = z.infer<typeof deletionAcceptedSchema>
