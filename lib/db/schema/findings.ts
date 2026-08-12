import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

import { analyses, speakers, transcriptSegments } from "./analysis"
import {
  claimTypeEnum,
  confidenceBandEnum,
  findingKindEnum,
  findingStateEnum,
  producingStageEnum,
  structureRelationEnum,
  supportLevelEnum,
  toulminRoleEnum,
} from "./enums"

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    kind: findingKindEnum("kind").notNull(),
    text: text("text").notNull(),
    paraphrase: boolean("paraphrase").notNull().default(false),
    confidenceRaw: real("confidence_raw"),
    confidenceSignals: jsonb("confidence_signals").$type<Record<string, unknown>>(),
    confidenceBand: confidenceBandEnum("confidence_band"),
    state: findingStateEnum("state").notNull().default("ok"),
    personInvolved: boolean("person_involved").notNull().default(false),
    producedByStage: producingStageEnum("produced_by_stage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("findings_analysis_kind_idx").on(table.analysisId, table.kind),
    index("findings_analysis_state_idx").on(table.analysisId, table.state),
    check(
      "findings_confidence_raw_range",
      sql`${table.confidenceRaw} is null or (${table.confidenceRaw} >= 0 and ${table.confidenceRaw} <= 1)`,
    ),
  ],
)

export const findingSpans = pgTable(
  "finding_spans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => transcriptSegments.id, { onDelete: "cascade" }),
    startChar: integer("start_char").notNull(),
    endChar: integer("end_char").notNull(),
  },
  (table) => [
    index("finding_spans_finding_idx").on(table.findingId),
    check(
      "finding_spans_valid_range",
      sql`${table.startChar} >= 0 and ${table.endChar} > ${table.startChar}`,
    ),
  ],
)

export const findingClaims = pgTable(
  "finding_claim",
  {
    findingId: uuid("finding_id")
      .primaryKey()
      .references(() => findings.id, { onDelete: "cascade" }),
    claimType: claimTypeEnum("claim_type").notNull(),
    checkWorthy: boolean("check_worthy").notNull(),
    speakerId: uuid("speaker_id").references(() => speakers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("finding_claim_check_worthy_idx").on(table.checkWorthy),
    index("finding_claim_speaker_idx").on(table.speakerId),
  ],
)

export const findingSupports = pgTable(
  "finding_support",
  {
    findingId: uuid("finding_id")
      .primaryKey()
      .references(() => findings.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    supportLevel: supportLevelEnum("support_level"),
    rationale: text("rationale").notNull(),
    reasonCode: text("reason_code").notNull(),
  },
  (table) => [
    uniqueIndex("finding_support_claim_uidx").on(table.claimId),
    check("finding_support_distinct_claim", sql`${table.findingId} <> ${table.claimId}`),
    check("finding_support_rationale_not_empty", sql`length(btrim(${table.rationale})) > 0`),
    check(
      "finding_support_reason_allowed",
      sql`${table.reasonCode} in ('explicit_support', 'limited_support', 'no_support_found', 'speaker_unattributed', 'attribution_uncertain', 'context_incomplete', 'model_uncertain')`,
    ),
  ],
)

export const findingStructures = pgTable(
  "finding_structure",
  {
    findingId: uuid("finding_id")
      .primaryKey()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceClaimId: uuid("source_claim_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    role: toulminRoleEnum("role").notNull(),
    inferred: boolean("inferred").notNull().default(false),
    anchorRole: text("anchor_role").notNull(),
  },
  (table) => [
    index("finding_structure_source_claim_idx").on(table.sourceClaimId),
    check("finding_structure_distinct_claim", sql`${table.findingId} <> ${table.sourceClaimId}`),
    check(
      "finding_structure_anchor_role_allowed",
      sql`${table.anchorRole} in ('asserted_content', 'inference_context', 'claim_subject')`,
    ),
    check(
      "finding_structure_inference_anchor",
      sql`(${table.inferred} and ${table.anchorRole} = 'inference_context') or (not ${table.inferred} and ${table.anchorRole} in ('asserted_content', 'claim_subject'))`,
    ),
  ],
)

export const findingFallacies = pgTable(
  "finding_fallacy",
  {
    findingId: uuid("finding_id")
      .primaryKey()
      .references(() => findings.id, { onDelete: "cascade" }),
    sourceClaimId: uuid("source_claim_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    possibleType: text("possible_type").notNull(),
    taxonomyRef: text("taxonomy_ref").notNull(),
    why: text("why").notNull(),
    caveat: text("caveat"),
  },
  (table) => [
    index("finding_fallacy_source_claim_idx").on(table.sourceClaimId),
    check("finding_fallacy_distinct_claim", sql`${table.findingId} <> ${table.sourceClaimId}`),
    check("finding_fallacy_possible_framing", sql`${table.possibleType} like 'Possible %'`),
    check("finding_fallacy_taxonomy_not_empty", sql`length(btrim(${table.taxonomyRef})) > 0`),
    check("finding_fallacy_why_not_empty", sql`length(btrim(${table.why})) > 0`),
  ],
)

export const structureEdges = pgTable(
  "structure_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    fromFindingId: uuid("from_finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    toFindingId: uuid("to_finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    relation: structureRelationEnum("relation").notNull(),
  },
  (table) => [
    index("structure_edges_analysis_idx").on(table.analysisId),
    index("structure_edges_from_idx").on(table.fromFindingId),
    index("structure_edges_to_idx").on(table.toFindingId),
    uniqueIndex("structure_edges_unique_relation_idx").on(
      table.analysisId,
      table.fromFindingId,
      table.toFindingId,
      table.relation,
    ),
    check("structure_edges_no_self_reference", sql`${table.fromFindingId} <> ${table.toFindingId}`),
  ],
)
