import { describe, expect, it } from "vitest"

import { assembleGatedPublicAnalysis } from "@/lib/analysis/public-analysis-core"
import type { InternalFinding } from "@/lib/contracts/analysis"

const analysisId = "00000000-0000-4000-8000-000000000001"
const segmentId = "00000000-0000-4000-8000-000000000002"
const anchored: InternalFinding = {
  id: "00000000-0000-4000-8000-000000000003",
  analysis_id: analysisId,
  kind: "claim",
  text: "An anchored claim.",
  paraphrase: false,
  confidence: { raw: 0.98, signals: { private: true } },
  confidence_band: null,
  state: "ok",
  person_involved: false,
  span_refs: [{ segment_id: segmentId, start_char: 0, end_char: 5 }],
  evidence_refs: [],
  produced_by_stage: "S2",
}

describe("centralized S9 public analysis assembly", () => {
  it("deep-allow-lists output, suppresses untraceable findings, and requires a category", () => {
    const assembled = assembleGatedPublicAnalysis({
      findings: [
        anchored,
        {
          ...anchored,
          id: "00000000-0000-4000-8000-000000000004",
          span_refs: [],
        },
      ],
      sources: [],
      structureEdges: [],
      validSegmentIds: new Set([segmentId]),
      evidenceRefsByClaim: new Map(),
      stageRuns: [],
    })

    expect(assembled.findings).toHaveLength(1)
    expect(assembled.findings[0].confidence_band).toBe("insufficient")
    expect(assembled.findings[0]).not.toHaveProperty("confidence")
    expect(JSON.stringify(assembled)).not.toContain('"raw"')
  })
})
