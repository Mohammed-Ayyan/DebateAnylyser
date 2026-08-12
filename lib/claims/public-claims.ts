import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import {
  publicClaimFindingSchema,
  type InternalClaimFinding,
  type PublicClaimFinding,
} from "@/lib/contracts/analysis"

export function toTraceablePublicClaims(
  findings: InternalClaimFinding[],
  validSegmentIds: ReadonlySet<string>,
): PublicClaimFinding[] {
  return findings.flatMap((finding) => {
    const result = applyTraceabilityGate({
      finding,
      validSegmentIds,
      verifiedEvidenceIds: new Set(),
    })
    return result.accepted ? [publicClaimFindingSchema.parse(result.finding)] : []
  })
}
