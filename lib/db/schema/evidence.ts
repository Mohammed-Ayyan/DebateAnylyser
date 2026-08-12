import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { analyses } from "./analysis"
import {
  credibilityFactorEnum,
  credibilityLevelEnum,
  evidenceRelationEnum,
  sourceTierEnum,
} from "./enums"
import { findings } from "./findings"

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    retrievedSnippet: text("retrieved_snippet").notNull(),
    provenance: text("provenance").notNull(),
    tier: sourceTierEnum("tier").notNull(),
    resolves: boolean("resolves").notNull(),
    supportsRelation: evidenceRelationEnum("supports_relation").notNull(),
    licensingQuoteVerified: boolean("licensing_quote_verified").notNull().default(false),
    verificationSignals: jsonb("verification_signals").$type<Record<string, unknown>>(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sources_analysis_retrieved_idx").on(table.analysisId, table.retrievedAt),
    check("sources_https_url", sql`${table.url} ~ '^https://'`),
    check("sources_snippet_not_empty", sql`length(btrim(${table.retrievedSnippet})) > 0`),
    check("sources_provenance_not_empty", sql`length(btrim(${table.provenance})) > 0`),
    check(
      "sources_verified_only",
      sql`${table.resolves} and ${table.licensingQuoteVerified} and ${table.supportsRelation} <> 'insufficient'`,
    ),
  ],
)

export const sourceCredibilityRatings = pgTable(
  "source_credibility_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    factor: credibilityFactorEnum("factor").notNull(),
    level: credibilityLevelEnum("level").notNull(),
    methodProvenance: text("method_provenance").notNull(),
    raterRef: text("rater_ref").notNull(),
    contested: boolean("contested").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("source_credibility_ratings_source_idx").on(table.sourceId),
    check(
      "source_credibility_ratings_method_not_empty",
      sql`length(btrim(${table.methodProvenance})) > 0`,
    ),
    check("source_credibility_ratings_rater_not_empty", sql`length(btrim(${table.raterRef})) > 0`),
    check("source_credibility_ratings_contested", sql`${table.contested}`),
  ],
)

export const findingCredibilities = pgTable(
  "finding_credibility",
  {
    findingId: uuid("finding_id")
      .primaryKey()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("finding_credibility_source_uidx").on(table.sourceId)],
)

export const findingEvidence = pgTable(
  "finding_evidence",
  {
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.findingId, table.sourceId] }),
    index("finding_evidence_source_idx").on(table.sourceId),
  ],
)
