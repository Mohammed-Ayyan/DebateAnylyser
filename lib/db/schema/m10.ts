import { sql } from "drizzle-orm"
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
} from "drizzle-orm/pg-core"

import { analyses } from "./analysis"
import {
  dataEventTypeEnum,
  exportKindEnum,
  exportStatusEnum,
  operationJobStatusEnum,
  operationJobTypeEnum,
  retentionScheduleStatusEnum,
  retentionSettingEnum,
  shareStatusEnum,
} from "./enums"
import { users } from "./identity"

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    status: shareStatusEnum("status").notNull().default("active"),
    policyVersion: text("policy_version").notNull(),
    disclaimerVersion: text("disclaimer_version").notNull(),
    limitationsUrl: text("limitations_url").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("shares_token_hash_uidx").on(table.tokenHash),
    index("shares_analysis_status_idx").on(table.analysisId, table.status),
    check(
      "shares_revocation_shape",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null) or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
  ],
)

export const dataExports = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "cascade" }),
    kind: exportKindEnum("kind").notNull(),
    status: exportStatusEnum("status").notNull().default("queued"),
    objectKey: text("object_key"),
    contentType: text("content_type"),
    policyVersion: text("policy_version"),
    disclaimerVersion: text("disclaimer_version"),
    limitationsUrl: text("limitations_url"),
    errorClass: text("error_class"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("exports_owner_created_idx").on(table.ownerId, table.createdAt),
    index("exports_analysis_status_idx").on(table.analysisId, table.status),
    uniqueIndex("exports_object_key_uidx")
      .on(table.objectKey)
      .where(sql`${table.objectKey} is not null`),
    check(
      "exports_kind_scope",
      sql`(${table.kind} = 'report_html' and ${table.analysisId} is not null) or (${table.kind} = 'account_data_json' and ${table.analysisId} is null)`,
    ),
  ],
)

export const dataEvents = pgTable(
  "data_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
    eventType: dataEventTypeEnum("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("data_events_owner_created_idx").on(table.ownerId, table.createdAt),
    index("data_events_analysis_created_idx").on(table.analysisId, table.createdAt),
  ],
)

export const retentionSchedules = pgTable(
  "retention_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    retentionSetting: retentionSettingEnum("retention_setting").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: retentionScheduleStatusEnum("status").notNull().default("scheduled"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("retention_schedules_analysis_uidx").on(table.analysisId),
    index("retention_schedules_claim_idx").on(table.status, table.dueAt),
    check("retention_schedules_bounded", sql`${table.retentionSetting} <> 'keep'`),
  ],
)

export const operationJobs = pgTable(
  "operation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: operationJobTypeEnum("type").notNull(),
    status: operationJobStatusEnum("status").notNull().default("queued"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    analysisId: uuid("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockToken: uuid("lock_token"),
    lastErrorClass: text("last_error_class"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operation_jobs_dedupe_key_uidx").on(table.dedupeKey),
    index("operation_jobs_claim_idx").on(table.status, table.availableAt),
    index("operation_jobs_analysis_idx").on(table.analysisId, table.status),
    index("operation_jobs_owner_idx").on(table.ownerId, table.status),
    check("operation_jobs_attempts_nonnegative", sql`${table.attempts} >= 0`),
  ],
)
