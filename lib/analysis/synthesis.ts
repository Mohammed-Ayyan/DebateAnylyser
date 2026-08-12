import {
  analysisOverviewSchema,
  type AnalysisOverview,
  type AssembledPublicFinding,
  type EvidenceSource,
} from "@/lib/contracts/analysis"

export function synthesizeCoverageOverview(
  findings: readonly AssembledPublicFinding[],
  sources: readonly EvidenceSource[],
): AnalysisOverview {
  const claims = findings.filter((finding) => finding.kind === "claim")
  const supports = findings.filter((finding) => finding.kind === "support")
  const countSupport = (level: "present" | "weak" | "absent") =>
    supports.filter(
      (finding) => finding.state !== "insufficient" && finding.support?.support_level === level,
    ).length
  const supportInsufficient = supports.filter(
    (finding) => finding.state === "insufficient" || finding.support?.support_level === null,
  ).length

  const categoricalRead =
    claims.length === 0
      ? "insufficient"
      : sources.length > 0
        ? "external_evidence_available"
        : claims.every((finding) => finding.span_refs.length > 0)
          ? "transcript_anchored"
          : "limited_coverage"

  return analysisOverviewSchema.parse({
    categorical_read: categoricalRead,
    distribution: {
      claims: claims.length,
      support_present: countSupport("present"),
      support_weak: countSupport("weak"),
      support_absent: countSupport("absent"),
      support_insufficient: supportInsufficient,
      verified_sources: sources.length,
      possible_patterns: findings.filter((finding) => finding.kind === "fallacy").length,
    },
    top_insight: `${claims.length} transcript-grounded claim(s) and ${sources.length} verified external source(s) are available for review.`,
    explore_pointers: claims.map((finding) => ({
      finding_id: finding.id,
      reason: finding.evidence_refs.length > 0 ? "external_evidence" : "claim_context",
    })),
  })
}
