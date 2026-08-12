import {
  publicFindingSchema,
  type InternalFinding,
  type PublicFinding,
} from "@/lib/contracts/analysis"
import type { NamedPersonReview } from "./named-person-guardrail"
import { evaluateNamedPersonGuardrail } from "./named-person-guardrail"

export type TraceabilityGateResult =
  | { accepted: true; finding: PublicFinding; guardrailReason?: string }
  | { accepted: false; reason: "untraceable" }

export function toPublicFinding(finding: InternalFinding): PublicFinding {
  return publicFindingSchema.parse(finding)
}

export function applyTraceabilityGate(options: {
  finding: InternalFinding
  validSegmentIds: ReadonlySet<string>
  verifiedEvidenceIds: ReadonlySet<string>
  negativePersonFinding?: boolean
  namedPersonReview?: NamedPersonReview
}): TraceabilityGateResult {
  const spanRefs = options.finding.span_refs.filter((span) =>
    options.validSegmentIds.has(span.segment_id),
  )
  const evidenceRefs = options.finding.evidence_refs.filter((id) =>
    options.verifiedEvidenceIds.has(id),
  )

  const namedPersonDecision = evaluateNamedPersonGuardrail({
    personInvolved: options.finding.person_involved,
    negativeImpact: options.negativePersonFinding ?? false,
    review: options.namedPersonReview,
    attachedVerifiedEvidenceIds: new Set(evidenceRefs),
  })

  let finding: InternalFinding = {
    ...options.finding,
    span_refs: spanRefs,
    evidence_refs: evidenceRefs,
  }
  let guardrailReason: string | undefined
  if (!namedPersonDecision.allowed) {
    guardrailReason = namedPersonDecision.reason
    finding = {
      ...finding,
      state: "insufficient",
      confidence_band: "insufficient",
    }
  } else if (namedPersonDecision.confidenceShouldBeLowered) {
    finding = {
      ...finding,
      confidence_band: finding.confidence_band === "high" ? "medium" : finding.confidence_band,
    }
  }

  const traceable =
    finding.span_refs.length > 0 ||
    finding.evidence_refs.length > 0 ||
    finding.state === "insufficient"
  if (!traceable) return { accepted: false, reason: "untraceable" }

  return {
    accepted: true,
    finding: toPublicFinding(finding),
    ...(guardrailReason ? { guardrailReason } : {}),
  }
}
