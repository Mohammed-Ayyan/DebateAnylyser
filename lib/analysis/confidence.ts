import {
  assembledPublicFindingSchema,
  confidenceBandSchema,
  type AssembledPublicFinding,
  type InternalFinding,
} from "@/lib/contracts/analysis"

export type PersistedConfidenceBand = InternalFinding["confidence_band"]

/**
 * M8 intentionally has no raw-score thresholds. A categorical value is accepted only
 * when an earlier server stage persisted it; missing calibration always means insufficient.
 */
export function normalizePersistedConfidence(
  band: PersistedConfidenceBand,
): AssembledPublicFinding["confidence_band"] {
  return band === null ? "insufficient" : confidenceBandSchema.parse(band)
}

export function withCategoricalConfidence(
  finding: InternalFinding,
): InternalFinding & { confidence_band: AssembledPublicFinding["confidence_band"] } {
  return {
    ...finding,
    confidence_band:
      finding.state === "insufficient"
        ? "insufficient"
        : normalizePersistedConfidence(finding.confidence_band),
  }
}

export function assertAssembledFinding(candidate: unknown): AssembledPublicFinding {
  return assembledPublicFindingSchema.parse(candidate)
}
