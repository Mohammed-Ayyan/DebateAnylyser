import type { AssembledAnalysis } from "@/lib/contracts/analysis"
import type { ReportAnnotationProjection, ReportContestProjection } from "./render-html"

export type OwnerAnnotationRow = {
  authorId: string
  findingId: string | null
  note: string | null
  visibility: "shown" | "hidden"
  highlighted: boolean
}

export type OwnerContestRow = {
  userId: string
  findingId: string
  state: "open" | "acknowledged" | "resolved_valid" | "resolved_invalid"
  reason: string | null
  resolution: string | null
}

export function projectOwnerCuration(
  ownerId: string,
  annotations: readonly OwnerAnnotationRow[],
  contests: readonly OwnerContestRow[],
): { annotations: ReportAnnotationProjection[]; contests: ReportContestProjection[] } {
  return {
    annotations: annotations
      .filter((row) => row.authorId === ownerId)
      .map((row) => ({
        finding_id: row.findingId,
        note: row.note,
        visibility: row.visibility,
        highlighted: row.highlighted,
      })),
    contests: contests
      .filter((row) => row.userId === ownerId)
      .map((row) => ({
        finding_id: row.findingId,
        state: row.state,
        reason: row.reason,
        resolution: row.resolution,
      })),
  }
}
export function applyCuration(
  analysis: AssembledAnalysis,
  annotations: readonly ReportAnnotationProjection[],
): AssembledAnalysis {
  const hidden = new Set(
    annotations
      .filter((annotation) => annotation.visibility === "hidden" && annotation.finding_id)
      .map((annotation) => annotation.finding_id as string),
  )
  const highlighted = new Set(
    annotations
      .filter((annotation) => annotation.highlighted && annotation.finding_id)
      .map((annotation) => annotation.finding_id as string),
  )
  const findings = analysis.findings
    .filter((finding) => !hidden.has(finding.id))
    .sort((left, right) => Number(highlighted.has(right.id)) - Number(highlighted.has(left.id)))
  const findingIds = new Set(findings.map((finding) => finding.id))
  const sourceIds = new Set(findings.flatMap((finding) => finding.evidence_refs))
  return {
    overview: analysis.overview,
    findings,
    sources: analysis.sources.filter((source) => sourceIds.has(source.id)),
    structure_edges: analysis.structure_edges.filter(
      (edge) => findingIds.has(edge.from_finding_id) && findingIds.has(edge.to_finding_id),
    ),
    stage_runs: analysis.stage_runs,
  }
}
