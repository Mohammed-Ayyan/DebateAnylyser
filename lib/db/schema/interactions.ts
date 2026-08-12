import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { analyses } from "./analysis"
import { annotationVisibilityEnum, contestStateEnum } from "./enums"
import { findings } from "./findings"
import { users } from "./identity"

export const contests = pgTable(
  "contests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason"),
    state: contestStateEnum("state").notNull().default("open"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contests_finding_created_idx").on(table.findingId, table.createdAt),
    index("contests_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("contests_active_finding_user_uidx")
      .on(table.findingId, table.userId)
      .where(sql`${table.state} in ('open', 'acknowledged')`),
    check(
      "contests_reason_valid",
      sql`${table.reason} is null or (length(btrim(${table.reason})) between 1 and 2000)`,
    ),
    check(
      "contests_resolution_shape",
      sql`(
        (${table.state} in ('open', 'acknowledged') and ${table.resolution} is null and ${table.resolvedAt} is null) or
        (${table.state} in ('resolved_valid', 'resolved_invalid') and ${table.resolution} is not null and length(btrim(${table.resolution})) between 1 and 4000 and ${table.resolvedAt} is not null)
      )`,
    ),
  ],
)

export const annotations = pgTable(
  "annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").references(() => findings.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    note: text("note"),
    visibility: annotationVisibilityEnum("visibility").notNull().default("shown"),
    highlighted: boolean("highlighted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("annotations_analysis_created_idx").on(table.analysisId, table.createdAt),
    index("annotations_finding_idx").on(table.findingId),
    uniqueIndex("annotations_finding_author_uidx").on(table.findingId, table.authorId),
    check(
      "annotations_note_valid",
      sql`${table.note} is null or (length(btrim(${table.note})) between 1 and 4000)`,
    ),
    check(
      "annotations_meaningful",
      sql`${table.note} is not null or ${table.visibility} = 'hidden' or ${table.highlighted} = true`,
    ),
  ],
)
