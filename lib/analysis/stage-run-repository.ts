import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"

import {
  publicStageRunSchema,
  type PipelineStage,
  type PublicStageRun,
  type StageStatus,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import { analysisStageRuns } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"
import { assertStageTransition } from "./status-lifecycle"

export async function getLatestStageRuns(analysisId: string): Promise<PublicStageRun[]> {
  const rows = await getDatabase()
    .select({
      stage: analysisStageRuns.stage,
      status: analysisStageRuns.status,
      attempt: analysisStageRuns.attempt,
      errorClass: analysisStageRuns.errorClass,
    })
    .from(analysisStageRuns)
    .where(eq(analysisStageRuns.analysisId, analysisId))
    .orderBy(asc(analysisStageRuns.stage), desc(analysisStageRuns.attempt))
  const latest = new Map<PipelineStage, (typeof rows)[number]>()
  for (const row of rows) if (!latest.has(row.stage)) latest.set(row.stage, row)
  return [...latest.values()].map((row) =>
    publicStageRunSchema.parse({
      stage: row.stage,
      status: row.status,
      attempt: row.attempt,
      error_class: row.errorClass,
    }),
  )
}

export async function transitionStageRun(
  runId: string,
  expected: StageStatus,
  next: StageStatus,
  errorClass?: string,
) {
  assertStageTransition(expected, next)
  const now = new Date()
  const [run] = await getDatabase()
    .update(analysisStageRuns)
    .set({
      status: next,
      startedAt: next === "running" ? now : undefined,
      finishedAt: next === "complete" || next === "failed" || next === "skipped" ? now : undefined,
      errorClass: next === "failed" ? (errorClass ?? "UNCLASSIFIED") : null,
    })
    .where(and(eq(analysisStageRuns.id, runId), eq(analysisStageRuns.status, expected)))
    .returning()
  if (!run) {
    throw new AppError({
      code: "STATUS_CONFLICT",
      status: 409,
      message: "Stage status changed before this operation completed.",
      expose: true,
      retryable: true,
    })
  }
  return run
}

export async function failRunningStageAttempts(
  analysisId: string,
  stage: PipelineStage,
  errorClass = "WORKER_LEASE_EXPIRED",
): Promise<void> {
  const now = new Date()
  await getDatabase()
    .update(analysisStageRuns)
    .set({ status: "failed", finishedAt: now, errorClass })
    .where(
      and(
        eq(analysisStageRuns.analysisId, analysisId),
        eq(analysisStageRuns.stage, stage),
        eq(analysisStageRuns.status, "running"),
      ),
    )
}

export async function ensureStageSkipped(
  analysisId: string,
  stage: PipelineStage,
): Promise<{ attempt: number; changed: boolean }> {
  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:${stage}`}, 0))`,
    )
    const [latest] = await tx
      .select()
      .from(analysisStageRuns)
      .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, stage)))
      .orderBy(desc(analysisStageRuns.attempt))
      .limit(1)

    if (latest && latest.status !== "pending") {
      return { attempt: latest.attempt, changed: false }
    }

    const pending =
      latest ??
      (await tx.insert(analysisStageRuns).values({ analysisId, stage, attempt: 1 }).returning())[0]
    const [skipped] = await tx
      .update(analysisStageRuns)
      .set({ status: "skipped", finishedAt: new Date(), errorClass: null })
      .where(and(eq(analysisStageRuns.id, pending.id), eq(analysisStageRuns.status, "pending")))
      .returning({ attempt: analysisStageRuns.attempt })
    if (!skipped) {
      throw new AppError({
        code: "STATUS_CONFLICT",
        status: 409,
        message: "Stage status changed before it could be skipped.",
        expose: true,
        retryable: true,
      })
    }
    return { attempt: skipped.attempt, changed: true }
  })
}
