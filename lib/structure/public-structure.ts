import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import {
  publicStructureFindingSchema,
  structureEdgeSchema,
  type InternalStructureFinding,
  type PublicStructureFinding,
  type StructureEdge,
} from "@/lib/contracts/analysis"

export type PublicStructureGraph = {
  findings: PublicStructureFinding[]
  edges: StructureEdge[]
}

export function toTraceablePublicStructure(
  findings: InternalStructureFinding[],
  edges: StructureEdge[],
  validSegmentIds: ReadonlySet<string>,
): PublicStructureGraph {
  const publicFindings = findings.flatMap((finding) => {
    const result = applyTraceabilityGate({
      finding,
      validSegmentIds,
      verifiedEvidenceIds: new Set(),
    })
    return result.accepted ? [publicStructureFindingSchema.parse(result.finding)] : []
  })
  const acceptedIds = new Set(publicFindings.map((finding) => finding.id))
  return {
    findings: publicFindings,
    edges: edges
      .filter(
        (edge) => acceptedIds.has(edge.from_finding_id) && acceptedIds.has(edge.to_finding_id),
      )
      .map((edge) => structureEdgeSchema.parse(edge)),
  }
}
