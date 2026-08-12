import type { AnalysisStatus, StageStatus } from "@/lib/contracts/analysis"

const analysisTransitions: Record<AnalysisStatus, readonly AnalysisStatus[]> = {
  queued: ["transcribing", "failed"],
  transcribing: ["analyzing", "failed"],
  analyzing: ["complete", "partial", "failed"],
  partial: ["analyzing"],
  complete: [],
  failed: ["queued"],
}

const stageTransitions: Record<StageStatus, readonly StageStatus[]> = {
  pending: ["running", "skipped"],
  running: ["complete", "failed"],
  complete: [],
  failed: [],
  skipped: [],
}

export class InvalidStatusTransitionError extends Error {
  constructor(entity: "analysis" | "stage", from: string, to: string) {
    super(`Invalid ${entity} status transition: ${from} -> ${to}`)
    this.name = "InvalidStatusTransitionError"
  }
}

export function assertAnalysisTransition(from: AnalysisStatus, to: AnalysisStatus): void {
  if (!analysisTransitions[from].includes(to)) {
    throw new InvalidStatusTransitionError("analysis", from, to)
  }
}

export function assertStageTransition(from: StageStatus, to: StageStatus): void {
  if (!stageTransitions[from].includes(to)) {
    throw new InvalidStatusTransitionError("stage", from, to)
  }
}

export function deriveAnalysisOutcome(
  statuses: readonly StageStatus[],
  usableFindingCount: number,
): "complete" | "partial" | "failed" {
  if (statuses.some((status) => status === "pending" || status === "running")) {
    throw new Error("Cannot derive a final analysis outcome while stages are unfinished")
  }
  if (!statuses.includes("failed")) return "complete"
  return usableFindingCount > 0 ? "partial" : "failed"
}
