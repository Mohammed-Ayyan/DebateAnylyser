import { pgEnum } from "drizzle-orm/pg-core"

export const retentionSettingEnum = pgEnum("retention_setting", [
  "keep",
  "30d",
  "90d",
  "delete_on_complete",
])
export const confidenceDisplayEnum = pgEnum("confidence_display", ["categorical", "numeric_optin"])
export const readingDensityEnum = pgEnum("reading_density", ["comfortable", "low_density"])
export const sourceTypeEnum = pgEnum("analysis_source_type", ["upload", "url", "paste"])
export const sourceRetrievalMethodEnum = pgEnum("source_retrieval_method", [
  "official_api",
  "official_captions",
  "direct_fetch",
  "none",
])
export const analysisStatusEnum = pgEnum("analysis_status", [
  "queued",
  "transcribing",
  "analyzing",
  "partial",
  "complete",
  "failed",
])
export const rightsCheckResultEnum = pgEnum("rights_check_result", ["passed", "blocked"])
export const transcriptSourceEnum = pgEnum("transcript_source", ["asr", "user_supplied"])
export const findingKindEnum = pgEnum("finding_kind", [
  "claim",
  "support",
  "structure",
  "fallacy",
  "credibility",
])
export const claimTypeEnum = pgEnum("claim_type", ["factual", "value", "policy", "causal"])
export const supportLevelEnum = pgEnum("support_level", ["present", "weak", "absent"])
export const toulminRoleEnum = pgEnum("toulmin_role", [
  "claim",
  "data",
  "warrant",
  "backing",
  "qualifier",
  "rebuttal",
])
export const structureRelationEnum = pgEnum("structure_relation", [
  "supports",
  "warrants",
  "backs",
  "qualifies",
  "rebuts",
])
export const sourceTierEnum = pgEnum("source_tier", ["T1", "T2", "T3"])
export const evidenceRelationEnum = pgEnum("evidence_relation", [
  "supports",
  "refutes",
  "neutral",
  "insufficient",
])
export const credibilityLevelEnum = pgEnum("credibility_level", ["higher", "mixed", "lower"])
export const credibilityFactorEnum = pgEnum("credibility_factor", [
  "editorial_standards",
  "ownership_transparency",
  "corrections_practice",
  "method_transparency",
  "source_attribution",
])
export const confidenceBandEnum = pgEnum("confidence_band", [
  "high",
  "medium",
  "low",
  "insufficient",
])
export const findingStateEnum = pgEnum("finding_state", ["ok", "insufficient", "contested"])
export const contestStateEnum = pgEnum("contest_state", [
  "open",
  "acknowledged",
  "resolved_valid",
  "resolved_invalid",
])
export const annotationVisibilityEnum = pgEnum("annotation_visibility", ["shown", "hidden"])
export const producingStageEnum = pgEnum("producing_stage", [
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
])
export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "S9",
  "S10",
])
export const stageStatusEnum = pgEnum("stage_status", [
  "pending",
  "running",
  "complete",
  "failed",
  "skipped",
])
export const ingestJobStatusEnum = pgEnum("ingest_job_status", [
  "queued",
  "processing",
  "complete",
  "failed",
])
export const shareStatusEnum = pgEnum("share_status", ["active", "revoked"])
export const exportKindEnum = pgEnum("export_kind", ["report_html", "account_data_json"])
export const exportStatusEnum = pgEnum("export_status", [
  "queued",
  "processing",
  "complete",
  "failed",
  "revoked",
])
export const dataEventTypeEnum = pgEnum("data_event_type", [
  "analysis_deletion_requested",
  "analysis_deleted",
  "account_deletion_requested",
  "account_deleted",
  "retention_updated",
])
export const retentionScheduleStatusEnum = pgEnum("retention_schedule_status", [
  "scheduled",
  "processing",
  "complete",
  "cancelled",
])
export const operationJobTypeEnum = pgEnum("operation_job_type", [
  "analysis_cleanup",
  "account_cleanup",
  "report_export",
  "account_data_export",
])
export const operationJobStatusEnum = pgEnum("operation_job_status", [
  "queued",
  "processing",
  "complete",
  "failed",
  "cancelled",
])
