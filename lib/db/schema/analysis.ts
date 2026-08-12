import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import {
  analysisStatusEnum,
  retentionSettingEnum,
  rightsCheckResultEnum,
  sourceRetrievalMethodEnum,
  sourceTypeEnum,
  transcriptSourceEnum,
} from "./enums"
import { users } from "./identity"

export const analyses = pgTable(
  "analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceMediaKey: text("source_media_key"),
    sourceUrl: text("source_url"),
    sourceRetrievalMethod: sourceRetrievalMethodEnum("source_retrieval_method"),
    title: text("title").notNull(),
    status: analysisStatusEnum("status").notNull().default("queued"),
    rightsCheckResult: rightsCheckResultEnum("rights_check_result"),
    rightsBlockReason: text("rights_block_reason"),
    retentionSetting: retentionSettingEnum("retention_setting").notNull().default("keep"),
    language: text("language"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("analyses_owner_created_idx").on(table.ownerId, table.createdAt),
    index("analyses_owner_status_idx").on(table.ownerId, table.status),
    uniqueIndex("analyses_source_media_key_uidx")
      .on(table.sourceMediaKey)
      .where(sql`${table.sourceMediaKey} is not null`),
    check(
      "analyses_source_shape",
      sql`(
        (${table.sourceType} = 'upload' and ${table.sourceMediaKey} is not null and ${table.sourceUrl} is null and ${table.sourceRetrievalMethod} is null) or
        (${table.sourceType} = 'url' and ${table.sourceMediaKey} is null and ${table.sourceUrl} is not null and ${table.sourceRetrievalMethod} is not null) or
        (${table.sourceType} = 'paste' and ${table.sourceMediaKey} is null and ${table.sourceUrl} is null and ${table.sourceRetrievalMethod} is null)
      )`,
    ),
  ],
)

export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .unique()
    .references(() => analyses.id, { onDelete: "cascade" }),
  source: transcriptSourceEnum("source").notNull(),
  language: text("language"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const speakers = pgTable(
  "speakers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    displayName: text("display_name"),
    isNamedPerson: boolean("is_named_person").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("speakers_transcript_label_uidx").on(table.transcriptId, table.label),
    index("speakers_transcript_idx").on(table.transcriptId),
    check("speakers_label_not_empty", sql`length(btrim(${table.label})) > 0`),
  ],
)

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    speakerId: uuid("speaker_id").references(() => speakers.id, { onDelete: "set null" }),
    idx: integer("idx").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    asrConf: real("asr_conf"),
    diarConf: real("diar_conf"),
    lowConf: boolean("low_conf").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transcript_segments_transcript_idx_uidx").on(table.transcriptId, table.idx),
    index("transcript_segments_timeline_idx").on(table.transcriptId, table.startMs),
    check("transcript_segments_idx_nonnegative", sql`${table.idx} >= 0`),
    check("transcript_segments_text_not_empty", sql`length(btrim(${table.text})) > 0`),
    check(
      "transcript_segments_time_range",
      sql`${table.startMs} >= 0 and ${table.endMs} >= ${table.startMs}`,
    ),
    check(
      "transcript_segments_asr_conf_range",
      sql`${table.asrConf} is null or (${table.asrConf} >= 0 and ${table.asrConf} <= 1)`,
    ),
    check(
      "transcript_segments_diar_conf_range",
      sql`${table.diarConf} is null or (${table.diarConf} >= 0 and ${table.diarConf} <= 1)`,
    ),
  ],
)
