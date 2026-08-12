import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { analyses } from "./analysis"
import { ingestJobStatusEnum, pipelineStageEnum } from "./enums"
import { users } from "./identity"

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaKey: text("media_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uploads_media_key_uidx").on(table.mediaKey),
    index("uploads_owner_created_idx").on(table.ownerId, table.createdAt),
    index("uploads_expiry_idx").on(table.expiresAt),
    check("uploads_size_positive", sql`${table.size} > 0`),
  ],
)

export const analysisInputs = pgTable(
  "analysis_inputs",
  {
    analysisId: uuid("analysis_id")
      .primaryKey()
      .references(() => analyses.id, { onDelete: "cascade" }),
    pasteText: text("paste_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("analysis_inputs_text_not_empty", sql`length(btrim(${table.pasteText})) > 0`)],
)
export const analysisJobs = pgTable(
  "analysis_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    status: ingestJobStatusEnum("status").notNull().default("queued"),
    stage: pipelineStageEnum("stage").notNull().default("S1"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockToken: uuid("lock_token"),
    lastErrorClass: text("last_error_class"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("analysis_jobs_analysis_uidx").on(table.analysisId),
    index("analysis_jobs_claim_idx").on(table.status, table.availableAt),
    check("analysis_jobs_attempts_nonnegative", sql`${table.attempts} >= 0`),
  ],
)

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_owner_scope_key_uidx").on(table.ownerId, table.scope, table.keyHash),
    index("idempotency_expiry_idx").on(table.expiresAt),
    check(
      "idempotency_response_status_range",
      sql`${table.responseStatus} >= 200 and ${table.responseStatus} <= 599`,
    ),
  ],
)
