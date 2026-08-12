import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import {
  publicSupportFindingSchema,
  type InternalSupportFinding,
  type PublicSupportFinding,
} from "@/lib/contracts/analysis"

export function toTraceablePublicSupport(
  findings: InternalSupportFinding[],
  validSegmentIds: ReadonlySet<string>,
): PublicSupportFinding[] {
  return findings.flatMap((finding) => {
    const result = applyTraceabilityGate({
      finding,
      validSegmentIds,
      verifiedEvidenceIds: new Set(),
    })
    return result.accepted ? [publicSupportFindingSchema.parse(result.finding)] : []
  })
}
