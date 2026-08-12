import type { AssembledPublicFinding } from "@/lib/contracts/analysis"
import { AsciiBadge } from "@/components/ascii-decorations"

const labels: Record<AssembledPublicFinding["confidence_band"], string> = {
  high: "HIGH CONFIDENCE",
  medium: "MEDIUM CONFIDENCE",
  low: "LOW CONFIDENCE",
  insufficient: "INSUFFICIENT CONFIDENCE",
}

export function CategoricalConfidenceBadge({
  band,
}: {
  band: AssembledPublicFinding["confidence_band"]
}) {
  return (
    <AsciiBadge
      variant={band === "high" ? "success" : band === "insufficient" ? "warning" : "outline"}
    >
      {labels[band]}
    </AsciiBadge>
  )
}
