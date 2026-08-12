import { z } from "zod"

export const reportExportRequestSchema = z.object({ format: z.literal("html") }).strict()
export const accountDataExportRequestSchema = z
  .object({ include_transcript: z.boolean().default(false) })
  .strict()

export const exportStatusSchema = z.enum(["queued", "processing", "complete", "failed", "revoked"])

export const exportResourceSchema = z
  .object({
    id: z.string().uuid(),
    analysis_id: z.string().uuid().nullable(),
    kind: z.enum(["report_html", "account_data_json"]),
    status: exportStatusSchema,
    content_type: z.string().nullable(),
    created_at: z.string().datetime(),
    completed_at: z.string().datetime().nullable(),
    download_url: z.string().url().optional(),
    download_expires_at: z.string().datetime().optional(),
  })
  .strict()

export const exportListSchema = z.object({ exports: z.array(exportResourceSchema) }).strict()
export const accountDataExportStatusSchema = z
  .object({ enabled: z.boolean(), export: exportResourceSchema.nullable() })
  .strict()

export type ExportResource = z.infer<typeof exportResourceSchema>
export function toExportResource(row: {
  id: string
  analysisId: string | null
  kind: "report_html" | "account_data_json"
  status: "queued" | "processing" | "complete" | "failed" | "revoked"
  contentType: string | null
  createdAt: Date
  completedAt: Date | null
}): ExportResource {
  return exportResourceSchema.parse({
    id: row.id,
    analysis_id: row.analysisId,
    kind: row.kind,
    status: row.status,
    content_type: row.contentType,
    created_at: row.createdAt.toISOString(),
    completed_at: row.completedAt?.toISOString() ?? null,
  })
}
