import type { PipelineStage, StageStatus } from "@/lib/contracts/analysis"

export const orderedPipelineStages: readonly PipelineStage[] = [
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
]

export function earliestResumableStage(
  latestRuns: ReadonlyMap<PipelineStage, StageStatus>,
): PipelineStage {
  return orderedPipelineStages.find((stage) => latestRuns.get(stage) !== "complete") ?? "S10"
}
