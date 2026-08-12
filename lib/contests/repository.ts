import "server-only"

import { and, desc, eq, inArray } from "drizzle-orm"

import type { Contest } from "./contracts"
import { getDatabase } from "@/lib/db/client"
import { findings } from "@/lib/db/schema/findings"
import { contests } from "@/lib/db/schema/interactions"

const activeStates = ["open", "acknowledged"] as const

type ContestRow = typeof contests.$inferSelect

export function toPublicContest(row: ContestRow): Contest {
  return {
    id: row.id,
    finding_id: row.findingId,
    reason: row.reason,
    state: row.state,
    resolution: row.resolution,
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function createOrGetOpenContest(input: {
  findingId: string
  userId: string
  reason?: string
}): Promise<ContestRow> {
  return getDatabase().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(contests)
      .values({
        findingId: input.findingId,
        userId: input.userId,
        reason: input.reason,
      })
      .onConflictDoNothing()
      .returning()

    const contest =
      inserted ??
      (
        await tx
          .select()
          .from(contests)
          .where(
            and(
              eq(contests.findingId, input.findingId),
              eq(contests.userId, input.userId),
              inArray(contests.state, [...activeStates]),
            ),
          )
          .limit(1)
      )[0]
    if (!contest) throw new Error("CONTEST_INSERT_FAILED")

    await tx.update(findings).set({ state: "contested" }).where(eq(findings.id, input.findingId))
    return contest
  })
}

export async function listContestsForAnalysis(analysisId: string): Promise<ContestRow[]> {
  return getDatabase()
    .select({
      id: contests.id,
      findingId: contests.findingId,
      userId: contests.userId,
      reason: contests.reason,
      state: contests.state,
      resolution: contests.resolution,
      resolvedAt: contests.resolvedAt,
      createdAt: contests.createdAt,
      updatedAt: contests.updatedAt,
    })
    .from(contests)
    .innerJoin(findings, eq(contests.findingId, findings.id))
    .where(eq(findings.analysisId, analysisId))
    .orderBy(desc(contests.createdAt), desc(contests.id))
}
