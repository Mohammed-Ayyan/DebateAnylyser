import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import {
  publicClaimFindingSchema,
  type InternalClaimFinding,
  type PublicClaimFinding,
} from "@/lib/contracts/analysis"

export function toTraceablePublicEvidenceClaims(
  claims: InternalClaimFinding[],
  evidenceRefs: ReadonlyMap<string, readonly string[]>,
  validSegmentIds: ReadonlySet<string>,
  verifiedEvidenceIds: ReadonlySet<string>,
  onlyWithEvidence = false,
): PublicClaimFinding[] {
  return claims.flatMap((claim) => {
    const refs = [...(evidenceRefs.get(claim.id) ?? [])].filter((id) => verifiedEvidenceIds.has(id))
    if (onlyWithEvidence && refs.length === 0) return []
    const result = applyTraceabilityGate({
      finding: { ...claim, evidence_refs: refs },
      validSegmentIds,
      verifiedEvidenceIds,
    })
    return result.accepted ? [publicClaimFindingSchema.parse(result.finding)] : []
  })
}
