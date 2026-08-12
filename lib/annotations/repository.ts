import "server-only"

import { and, asc, eq } from "drizzle-orm"

import type { Annotation } from "./contracts"
import { getDatabase } from "@/lib/db/client"
import { findings } from "@/lib/db/schema/findings"
import { annotations } from "@/lib/db/schema/interactions"
import { AppError } from "@/lib/errors/app-error"

type AnnotationRow = typeof annotations.$inferSelect
export type AnnotationValues = {
  note?: string | null
  visibility?: "shown" | "hidden"
  highlighted?: boolean
}

export function toPublicAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    analysis_id: row.analysisId,
    finding_id: row.findingId,
    note: row.note,
    visibility: row.visibility,
    highlighted: row.highlighted,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function requireFindingInAnalysis(
  tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0],
  analysisId: string,
  findingId: string,
): Promise<void> {
  const [row] = await tx
    .select({ id: findings.id })
    .from(findings)
    .where(and(eq(findings.id, findingId), eq(findings.analysisId, analysisId)))
    .limit(1)
  if (!row) {
    throw new AppError({
      code: "FINDING_NOT_FOUND",
      status: 404,
      message: "Finding not found in this analysis.",
      expose: true,
    })
  }
}

export async function createAnnotation(input: {
  analysisId: string
  findingId?: string | null
  authorId: string
  values: AnnotationValues
}): Promise<AnnotationRow> {
  return getDatabase().transaction(async (tx) => {
    if (input.findingId) await requireFindingInAnalysis(tx, input.analysisId, input.findingId)
    const values = {
      analysisId: input.analysisId,
      findingId: input.findingId ?? null,
      authorId: input.authorId,
      note: input.values.note ?? null,
      visibility: input.values.visibility ?? ("shown" as const),
      highlighted: input.values.highlighted ?? false,
    }
    const query = tx.insert(annotations).values(values)
    const [row] = input.findingId
      ? await query
          .onConflictDoUpdate({
            target: [annotations.findingId, annotations.authorId],
            set: {
              note: values.note,
              visibility: values.visibility,
              highlighted: values.highlighted,
              updatedAt: new Date(),
            },
          })
          .returning()
      : await query.returning()
    if (!row) throw new Error("ANNOTATION_INSERT_FAILED")
    return row
  })
}

export async function listAnnotationsForAnalysis(analysisId: string): Promise<AnnotationRow[]> {
  return getDatabase()
    .select()
    .from(annotations)
    .where(eq(annotations.analysisId, analysisId))
    .orderBy(asc(annotations.createdAt), asc(annotations.id))
}

export async function updateAnnotation(
  annotationId: string,
  values: AnnotationValues,
): Promise<AnnotationRow> {
  const [row] = await getDatabase()
    .update(annotations)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(annotations.id, annotationId))
    .returning()
  if (!row)
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Annotation not found.",
      expose: true,
    })
  return row
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  await getDatabase().delete(annotations).where(eq(annotations.id, annotationId))
}
