import { z } from "zod"

const exportIdSchema = z.object({ export_id: z.string().uuid() })

export const reportExportJobPayloadSchema = exportIdSchema.strict()
export const accountDataExportJobPayloadSchema = exportIdSchema
  .extend({ include_transcript: z.boolean() })
  .strict()

export function reportExportJobValues(ownerId: string, analysisId: string, exportId: string) {
  return {
    type: "report_export" as const,
    ownerId,
    analysisId,
    dedupeKey: `report-export:${exportId}`,
    payload: reportExportJobPayloadSchema.parse({ export_id: exportId }),
  }
}

export function accountDataExportJobValues(
  ownerId: string,
  exportId: string,
  includeTranscript: boolean,
) {
  return {
    type: "account_data_export" as const,
    ownerId,
    dedupeKey: `account-data-export:${exportId}`,
    payload: accountDataExportJobPayloadSchema.parse({
      export_id: exportId,
      include_transcript: includeTranscript,
    }),
  }
}

export function publicExportErrorClass(error: unknown): string {
  if (error instanceof Error) {
    const normalized = error.message
      .replace(/[^A-Z0-9_]/gi, "_")
      .toUpperCase()
      .slice(0, 80)
    if (/^[A-Z][A-Z0-9_]*$/.test(normalized)) return normalized
  }
  return "EXPORT_FAILED"
}
