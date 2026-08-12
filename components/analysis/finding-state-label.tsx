import type { AssembledPublicFinding } from "@/lib/contracts/analysis"
import { AsciiBadge } from "@/components/ascii-decorations"

export function FindingStateLabel({ state }: { state: AssembledPublicFinding["state"] }) {
  if (state === "contested") return <AsciiBadge variant="warning">CONTESTED</AsciiBadge>
  if (state === "insufficient") {
    return <AsciiBadge variant="warning">INSUFFICIENT EVIDENCE</AsciiBadge>
  }
  return <AsciiBadge variant="outline">TRACEABLE</AsciiBadge>
}
