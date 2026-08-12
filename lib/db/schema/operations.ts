import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  bigint,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { analyses, transcriptSegments } from "./analysis"
import { pipelineStageEnum, stageStatusEnum } from "./enums"

export const analysisStageRuns = pgTable(
  "analysis_stage_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    stage: pipelineStageEnum("stage").notNull(),
    status: stageStatusEnum("status").notNull().default("pending"),
    attempt: integer("attempt").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorClass: text("error_class"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stage_runs_analysis_stage_attempt_uidx").on(
      table.analysisId,
      table.stage,
      table.attempt,
    ),
    index("stage_runs_analysis_status_idx").on(table.analysisId, table.status),
    check("stage_runs_attempt_positive", sql`${table.attempt} > 0`),
  ],
)

export const injectionFlags = pgTable("injection_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => analyses.id, { onDelete: "cascade" }),
  segmentId: uuid("segment_id").references(() => transcriptSegments.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const analysisEvents = pgTable(
  "analysis_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    sequence: bigint("sequence", { mode: "bigint" }).notNull(),
    eventId: uuid("event_id").notNull().defaultRandom(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("analysis_events_analysis_sequence_uidx").on(table.analysisId, table.sequence),
    uniqueIndex("analysis_events_event_id_uidx").on(table.eventId),
    index("analysis_events_replay_idx").on(table.analysisId, table.sequence, table.expiresAt),
    check("analysis_events_schema_version_positive", sql`${table.schemaVersion} > 0`),
  ],
)
