import "server-only"

import { getLatestStageRuns } from "./stage-run-repository"
import { assembleGatedPublicAnalysis } from "./public-analysis-core"
import { getClaimStageSnapshot } from "@/lib/claims/repository"
import type { AssembledAnalysis, InternalFinding, PublicStageRun } from "@/lib/contracts/analysis"
import { getCredibilityStageSnapshot } from "@/lib/credibility/repository"
import {
  getEvidenceRefsByClaim,
  getEvidenceSources,
  getEvidenceStageSnapshot,
} from "@/lib/evidence/repository"
import { getFallacyStageSnapshot } from "@/lib/fallacy/repository"
import { getStructureStageSnapshot } from "@/lib/structure/repository"
import { getSupportStageSnapshot } from "@/lib/support/repository"
import { getTranscriptForAnalysis } from "@/lib/transcription/transcript-repository"

export type PublicAnalysisState = {
  stageRuns: PublicStageRun[]
  assembled?: AssembledAnalysis
}

export async function loadPublicAnalysisState(
  analysisId: string,
  options: { requireS9?: boolean } = {},
): Promise<PublicAnalysisState> {
  const [
    claims,
    support,
    structure,
    fallacy,
    evidence,
    credibility,
    refs,
    sources,
    transcript,
    runs,
  ] = await Promise.all([
    getClaimStageSnapshot(analysisId),
    getSupportStageSnapshot(analysisId),
    getStructureStageSnapshot(analysisId),
    getFallacyStageSnapshot(analysisId),
    getEvidenceStageSnapshot(analysisId),
    getCredibilityStageSnapshot(analysisId),
    getEvidenceRefsByClaim(analysisId),
    getEvidenceSources(analysisId),
    getTranscriptForAnalysis(analysisId),
    getLatestStageRuns(analysisId),
  ])

  const requireS9 = options.requireS9 ?? true
  const s9Complete = runs.some((run) => run.stage === "S9" && run.status === "complete")
  if (requireS9 && !s9Complete) return { stageRuns: runs }
  const findings: InternalFinding[] = [
    ...(claims?.findings ?? []),
    ...(support?.findings ?? []),
    ...(structure?.findings ?? []),
    ...(fallacy?.findings ?? []),
    ...(credibility?.findings ?? []),
  ]
  const assembled = assembleGatedPublicAnalysis({
    findings,
    sources: evidence?.status === "complete" ? sources : [],
    structureEdges: structure?.edges ?? [],
    validSegmentIds: new Set(transcript?.segments.map((segment) => segment.id) ?? []),
    evidenceRefsByClaim: refs,
    stageRuns: runs,
  })
  return { stageRuns: runs, assembled }
}

export async function requireInternalAssembly(analysisId: string): Promise<AssembledAnalysis> {
  const state = await loadPublicAnalysisState(analysisId, { requireS9: false })
  if (!state.assembled) throw new Error("Analysis assembly inputs are not available")
  return state.assembled
}
