import { z } from "zod"

export const annotationVisibilitySchema = z.enum(["shown", "hidden"])
const noteSchema = z.string().trim().min(1).max(4_000).nullable()
const annotationFields = {
  note: noteSchema.optional(),
  visibility: annotationVisibilitySchema.optional(),
  highlighted: z.boolean().optional(),
}
function meaningful(value: {
  note?: string | null
  visibility?: "shown" | "hidden"
  highlighted?: boolean
}) {
  return value.note != null || value.visibility === "hidden" || value.highlighted === true
}
export const createAnnotationSchema = z
  .object({ finding_id: z.string().uuid().nullable().optional(), ...annotationFields })
  .strict()
  .refine(meaningful, "An annotation must contain a note or curation state.")
export const updateAnnotationSchema = z
  .object(annotationFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.")
export const annotationSchema = z
  .object({
    id: z.string().uuid(),
    analysis_id: z.string().uuid(),
    finding_id: z.string().uuid().nullable(),
    note: z.string().nullable(),
    visibility: annotationVisibilitySchema,
    highlighted: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict()
export const annotationListSchema = z.object({ annotations: z.array(annotationSchema) }).strict()

export type Annotation = z.infer<typeof annotationSchema>
export { meaningful as isMeaningfulAnnotation }
