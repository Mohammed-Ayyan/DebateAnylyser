import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import {
  assembledAnalysisSchema,
  type AssembledAnalysis,
  type EvidenceSource,
  type InternalFinding,
  type PublicStageRun,
  type StructureEdge,
} from "@/lib/contracts/analysis"
import { assertAssembledFinding, withCategoricalConfidence } from "./confidence"
import { synthesizeCoverageOverview } from "./synthesis"

export type PublicAnalysisAssemblyInput = {
  findings: readonly InternalFinding[]
  sources: readonly EvidenceSource[]
  structureEdges: readonly StructureEdge[]
  validSegmentIds: ReadonlySet<string>
  evidenceRefsByClaim: ReadonlyMap<string, readonly string[]>
  stageRuns: readonly PublicStageRun[]
}

function isNegativePersonFinding(finding: InternalFinding): boolean {
  return (
    finding.kind === "fallacy" ||
    (finding.kind === "support" && finding.support?.support_level === "absent")
  )
}

export function assembleGatedPublicAnalysis(input: PublicAnalysisAssemblyInput): AssembledAnalysis {
  const verifiedEvidenceIds = new Set(input.sources.map((source) => source.id))
  const gated = input.findings.flatMap((candidate) => {
    const finding = withCategoricalConfidence({
      ...candidate,
      evidence_refs:
        candidate.kind === "claim"
          ? [...(input.evidenceRefsByClaim.get(candidate.id) ?? [])]
          : candidate.evidence_refs,
    })
    const result = applyTraceabilityGate({
      finding,
      validSegmentIds: input.validSegmentIds,
      verifiedEvidenceIds,
      negativePersonFinding: isNegativePersonFinding(finding),
    })
    return result.accepted ? [assertAssembledFinding(result.finding)] : []
  })
  const acceptedIds = new Set(gated.map((finding) => finding.id))
  const referencedSourceIds = new Set(gated.flatMap((finding) => finding.evidence_refs))
  const sources = input.sources.filter((source) => referencedSourceIds.has(source.id))
  const structureEdges = input.structureEdges.filter(
    (edge) => acceptedIds.has(edge.from_finding_id) && acceptedIds.has(edge.to_finding_id),
  )

  return assembledAnalysisSchema.parse({
    overview: synthesizeCoverageOverview(gated, sources),
    findings: gated,
    sources,
    structure_edges: structureEdges,
    stage_runs: input.stageRuns,
  })
}
