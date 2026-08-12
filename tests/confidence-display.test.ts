import { describe, expect, it } from "vitest"

import { normalizePersistedConfidence, withCategoricalConfidence } from "@/lib/analysis/confidence"
import type { InternalFinding } from "@/lib/contracts/analysis"

const finding: InternalFinding = {
  id: "00000000-0000-4000-8000-000000000001",
  analysis_id: "00000000-0000-4000-8000-000000000002",
  kind: "claim",
  text: "A transcript-grounded claim.",
  paraphrase: false,
  confidence: { raw: 0.99 },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [
    {
      segment_id: "00000000-0000-4000-8000-000000000003",
      start_char: 0,
      end_char: 5,
    },
  ],
  evidence_refs: [],
  produced_by_stage: "S2",
}

describe("F13 categorical confidence", () => {
  it("never derives a category from raw model confidence without calibration", () => {
    expect(normalizePersistedConfidence(null)).toBe("insufficient")
    expect(withCategoricalConfidence(finding).confidence_band).toBe("insufficient")
  })

  it("preserves an existing server-produced category", () => {
    expect(normalizePersistedConfidence("medium")).toBe("medium")
  })

  it("forces insufficient findings to the insufficient category", () => {
    expect(
      withCategoricalConfidence({ ...finding, state: "insufficient", confidence_band: "high" })
        .confidence_band,
    ).toBe("insufficient")
  })
})
