import { describe, expect, it } from "vitest"

import { synthesizeCoverageOverview } from "@/lib/analysis/synthesis"
import type { AssembledPublicFinding } from "@/lib/contracts/analysis"

const claim: AssembledPublicFinding = {
  id: "00000000-0000-4000-8000-000000000001",
  analysis_id: "00000000-0000-4000-8000-000000000002",
  kind: "claim",
  text: "A claim anchored in the transcript.",
  paraphrase: false,
  confidence_band: "insufficient",
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
  claim: {
    claim_type: "factual",
    check_worthy: true,
    speaker_id: null,
    speaker_label: "Speaker 1",
  },
}

describe("S8 bounded synthesis", () => {
  it("describes coverage without scores, winners, truth stamps, or person verdicts", () => {
    const overview = synthesizeCoverageOverview([claim], [])
    expect(overview.categorical_read).toBe("transcript_anchored")
    expect(overview.distribution.claims).toBe(1)
    expect(overview.explore_pointers).toEqual([{ finding_id: claim.id, reason: "claim_context" }])
    expect(JSON.stringify(overview)).not.toMatch(/winner|score|true|false|liar|quality/i)
  })

  it("uses insufficient when no traceable claims are available", () => {
    expect(synthesizeCoverageOverview([], []).categorical_read).toBe("insufficient")
  })
})
