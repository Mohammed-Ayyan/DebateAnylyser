import "server-only"

import { asc, desc, eq, sql } from "drizzle-orm"

import { getRedis } from "@/lib/cache/redis"
import { analysisEventSchema, type AnalysisEvent } from "@/lib/contracts/events"
import { getDatabase } from "@/lib/db/client"
import { analysisEvents } from "@/lib/db/schema"
import { serverEnv } from "@/lib/env/server"
import { logger } from "@/lib/observability/logger"
import { assessReplayWindow } from "./replay-window"

export type StoredAnalysisEvent = {
  sequence: bigint
  event: AnalysisEvent
}

export type ReplayResult =
  | { kind: "events"; events: StoredAnalysisEvent[] }
  | { kind: "reconcile-required" }

export function analysisEventChannel(analysisId: string): string {
  return `debate:analysis-events:${analysisId}`
}

export async function appendAnalysisEvent(
  analysisId: string,
  candidate: AnalysisEvent,
): Promise<StoredAnalysisEvent> {
  const event = analysisEventSchema.parse(candidate)
  const stored = await getDatabase().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${analysisId}, 0))`)
    const [latest] = await tx
      .select({ sequence: analysisEvents.sequence })
      .from(analysisEvents)
      .where(eq(analysisEvents.analysisId, analysisId))
      .orderBy(desc(analysisEvents.sequence))
      .limit(1)
    const sequence = (latest?.sequence ?? 0n) + 1n
    const [row] = await tx
      .insert(analysisEvents)
      .values({
        analysisId,
        sequence,
        eventType: event.type,
        payload: event,
        expiresAt: new Date(Date.now() + serverEnv.EVENT_RETENTION_SECONDS * 1000),
      })
      .returning({ sequence: analysisEvents.sequence, payload: analysisEvents.payload })
    return { sequence: row.sequence, event: analysisEventSchema.parse(row.payload) }
  })

  try {
    await getRedis().publish(analysisEventChannel(analysisId), stored.sequence.toString())
  } catch (error) {
    logger.warn("analysis_event.redis_publish_failed", {
      analysisId,
      sequence: stored.sequence,
      error,
    })
  }
  return stored
}
export async function replayAnalysisEvents(
  analysisId: string,
  cursor: bigint,
): Promise<ReplayResult> {
  const db = getDatabase()
  const now = new Date()
  const [latest] = await db
    .select({ sequence: analysisEvents.sequence })
    .from(analysisEvents)
    .where(eq(analysisEvents.analysisId, analysisId))
    .orderBy(desc(analysisEvents.sequence))
    .limit(1)
  const latestSequence = latest?.sequence ?? 0n
  if (cursor > latestSequence) return { kind: "reconcile-required" }

  const rows = await db
    .select({ sequence: analysisEvents.sequence, payload: analysisEvents.payload })
    .from(analysisEvents)
    .where(
      sql`${analysisEvents.analysisId} = ${analysisId}
        and ${analysisEvents.sequence} > ${cursor}
        and ${analysisEvents.expiresAt} > ${now}`,
    )
    .orderBy(asc(analysisEvents.sequence))
    .limit(serverEnv.EVENT_REPLAY_LIMIT + 1)

  const decision = assessReplayWindow({
    cursor,
    latestSequence,
    retainedSequences: rows.map((row) => row.sequence),
    replayLimit: serverEnv.EVENT_REPLAY_LIMIT,
  })
  if (decision === "reconcile-required") return { kind: "reconcile-required" }

  return {
    kind: "events",
    events: rows.map((row) => ({
      sequence: row.sequence,
      event: analysisEventSchema.parse(row.payload),
    })),
  }
}
export async function deleteExpiredAnalysisEvents(batchSize = 1_000): Promise<void> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
    throw new RangeError("batchSize must be an integer between 1 and 10000")
  }
  await getDatabase().execute(sql`
    with expired as (
      select ${analysisEvents.id}
      from ${analysisEvents}
      where ${analysisEvents.expiresAt} <= now()
      order by ${analysisEvents.expiresAt}
      limit ${batchSize}
      for update skip locked
    )
    delete from ${analysisEvents}
    using expired
    where ${analysisEvents.id} = expired.id
  `)
}
