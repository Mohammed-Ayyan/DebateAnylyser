import type { PipelineStage } from "@/lib/contracts/analysis"

export type AnalysisFeatureFlags = {
  supportAssessment: boolean
  argumentStructure: boolean
  evidenceRetrieval: boolean
  fallacyDetection?: boolean
  sourceCredibility?: boolean
}

export function nextStageAfterS1(claimExtractionEnabled: boolean): PipelineStage {
  return claimExtractionEnabled ? "S2" : "S8"
}

export function nextStageAfterS2(flags: AnalysisFeatureFlags): PipelineStage {
  if (flags.supportAssessment) return "S3"
  if (flags.evidenceRetrieval) return "S6"
  return "S8"
}

export function nextStageAfterS3(flags: AnalysisFeatureFlags): PipelineStage {
  if (flags.argumentStructure) return "S4"
  if (flags.evidenceRetrieval) return "S6"
  return "S8"
}

export function nextStageAfterS4(flags: AnalysisFeatureFlags): PipelineStage {
  if (flags.fallacyDetection) return "S5"
  return flags.evidenceRetrieval ? "S6" : "S8"
}

export function nextStageAfterS5(flags: AnalysisFeatureFlags): PipelineStage {
  return flags.evidenceRetrieval ? "S6" : "S8"
}

export function nextStageAfterS6(flags: AnalysisFeatureFlags): PipelineStage {
  return flags.sourceCredibility ? "S7" : "S8"
}

export function nextStageAfterS7(): PipelineStage {
  return "S8"
}

export function nextStageAfterS8(): PipelineStage {
  return "S9"
}

export function nextStageAfterS9(): PipelineStage {
  return "S10"
}
