import "server-only"

import type { PipelineStage } from "@/lib/contracts/analysis"
import { appendAnalysisEvent } from "@/lib/events/repository"
import { ensureStageSkipped } from "./stage-run-repository"

export const CLAIM_DEPENDENT_STAGES: readonly PipelineStage[] = ["S2", "S3", "S4", "S5", "S6", "S7"]

type SkippedStageDependencies = {
  ensureSkipped: typeof ensureStageSkipped
  appendEvent: typeof appendAnalysisEvent
}

const defaults = (): SkippedStageDependencies => ({
  ensureSkipped: ensureStageSkipped,
  appendEvent: appendAnalysisEvent,
})

export async function markStagesSkipped(
  analysisId: string,
  stages: readonly PipelineStage[],
  dependencies: SkippedStageDependencies = defaults(),
): Promise<void> {
  for (const stage of stages) {
    const result = await dependencies.ensureSkipped(analysisId, stage)
    if (!result.changed) continue
    await dependencies.appendEvent(analysisId, {
      type: "stage.status",
      stage,
      status: "skipped",
      attempt: result.attempt,
    })
  }
}
