export type VerificationVerdict = "holds" | "weakened" | "refuted"

export type NamedPersonReview = {
  xcVerdict: VerificationVerdict
  independentlyVerifiedEvidence: ReadonlyArray<{
    evidenceId: string
    independenceKey: string
  }>
}

export type NamedPersonDecision =
  | { allowed: true; confidenceShouldBeLowered: boolean }
  | { allowed: false; reason: "xc_required" | "xc_not_supported" | "independent_evidence_required" }

export function evaluateNamedPersonGuardrail(options: {
  personInvolved: boolean
  negativeImpact: boolean
  review?: NamedPersonReview
  attachedVerifiedEvidenceIds: ReadonlySet<string>
}): NamedPersonDecision {
  if (!options.personInvolved) return { allowed: true, confidenceShouldBeLowered: false }
  if (!options.review) return { allowed: false, reason: "xc_required" }
  if (options.review.xcVerdict === "refuted") {
    return { allowed: false, reason: "xc_not_supported" }
  }

  if (options.negativeImpact) {
    const independentSources = new Set(
      options.review.independentlyVerifiedEvidence
        .filter((item) => options.attachedVerifiedEvidenceIds.has(item.evidenceId))
        .map((item) => item.independenceKey),
    )
    if (independentSources.size < 2) {
      return { allowed: false, reason: "independent_evidence_required" }
    }
  }

  return {
    allowed: true,
    confidenceShouldBeLowered: options.review.xcVerdict === "weakened",
  }
}
