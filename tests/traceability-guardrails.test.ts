import { describe, expect, it } from "vitest"

import { evaluateNamedPersonGuardrail } from "@/lib/ai/named-person-guardrail"
import { applyTraceabilityGate } from "@/lib/ai/traceability-gate"
import type { InternalFinding } from "@/lib/contracts/analysis"

const finding: InternalFinding = {
  id: "00000000-0000-4000-8000-000000000001",
  analysis_id: "00000000-0000-4000-8000-000000000002",
  kind: "fallacy",
  text: "Possible unsupported pattern",
  paraphrase: false,
  confidence: { raw: 0.91, signals: { model: "internal" } },
  confidence_band: "high",
  state: "ok",
  person_involved: false,
  span_refs: [],
  evidence_refs: [],
  produced_by_stage: "S5",
}

describe("S9 traceability gate", () => {
  it("drops unanchored findings and permits explicit insufficiency", () => {
    const dropped = applyTraceabilityGate({
      finding,
      validSegmentIds: new Set(),
      verifiedEvidenceIds: new Set(),
    })
    expect(dropped).toEqual({ accepted: false, reason: "untraceable" })

    const accepted = applyTraceabilityGate({
      finding: { ...finding, state: "insufficient" },
      validSegmentIds: new Set(),
      verifiedEvidenceIds: new Set(),
    })
    expect(accepted.accepted).toBe(true)
  })

  it("never exposes raw model confidence", () => {
    const segmentId = "00000000-0000-4000-8000-000000000003"
    const accepted = applyTraceabilityGate({
      finding: {
        ...finding,
        span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 8 }],
      },
      validSegmentIds: new Set([segmentId]),
      verifiedEvidenceIds: new Set(),
    })
    expect(accepted.accepted).toBe(true)
    if (accepted.accepted) expect(accepted.finding).not.toHaveProperty("confidence")
  })
})

describe("XD named-person guardrail", () => {
  const evidence = new Set(["e1", "e2"])

  it("requires XC and two independent verified sources for negative findings", () => {
    expect(
      evaluateNamedPersonGuardrail({
        personInvolved: true,
        negativeImpact: true,
        attachedVerifiedEvidenceIds: evidence,
      }),
    ).toEqual({ allowed: false, reason: "xc_required" })

    const decision = evaluateNamedPersonGuardrail({
      personInvolved: true,
      negativeImpact: true,
      attachedVerifiedEvidenceIds: evidence,
      review: {
        xcVerdict: "holds",
        independentlyVerifiedEvidence: [
          { evidenceId: "e1", independenceKey: "publisher-a" },
          { evidenceId: "e2", independenceKey: "publisher-b" },
        ],
      },
    })
    expect(decision).toEqual({ allowed: true, confidenceShouldBeLowered: false })
  })
})
