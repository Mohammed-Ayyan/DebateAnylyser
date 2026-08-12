import "server-only"

import { and, desc, eq } from "drizzle-orm"

import type { AnalysisStatus, PipelineStage, StageStatus } from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import { analyses, analysisStageRuns } from "@/lib/db/schema"

export async function getFinalizationAnalysis(
  analysisId: string,
): Promise<{ status: AnalysisStatus } | undefined> {
  const [analysis] = await getDatabase()
    .select({ status: analyses.status })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1)
  return analysis
}

export async function getFinalizationStage(
  analysisId: string,
  stage: PipelineStage,
): Promise<{ status: StageStatus; attempt: number } | undefined> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, stage)))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  return run
}
