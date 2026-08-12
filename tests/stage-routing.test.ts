import { describe, expect, it } from "vitest"

import {
  nextStageAfterS1,
  nextStageAfterS4,
  nextStageAfterS5,
  nextStageAfterS6,
  nextStageAfterS7,
  nextStageAfterS8,
  nextStageAfterS9,
  type AnalysisFeatureFlags,
} from "@/lib/analysis/stage-routing"

const flags = (overrides: Partial<AnalysisFeatureFlags> = {}): AnalysisFeatureFlags => ({
  supportAssessment: true,
  argumentStructure: true,
  evidenceRetrieval: true,
  fallacyDetection: false,
  sourceCredibility: false,
  ...overrides,
})

describe("M8 stage routing", () => {
  it("routes S1 around claim-dependent providers when claim extraction is disabled", () => {
    expect(nextStageAfterS1(true)).toBe("S2")
    expect(nextStageAfterS1(false)).toBe("S8")
  })

  it("routes optional S5 and S7 stages only when independently enabled", () => {
    expect(nextStageAfterS4(flags({ fallacyDetection: true }))).toBe("S5")
    expect(nextStageAfterS4(flags())).toBe("S6")
    expect(nextStageAfterS5(flags())).toBe("S6")
    expect(nextStageAfterS6(flags({ sourceCredibility: true }))).toBe("S7")
  })

  it("always hands the last enabled analysis branch to S8", () => {
    expect(nextStageAfterS4(flags({ evidenceRetrieval: false }))).toBe("S8")
    expect(nextStageAfterS5(flags({ evidenceRetrieval: false }))).toBe("S8")
    expect(nextStageAfterS6(flags())).toBe("S8")
    expect(nextStageAfterS7()).toBe("S8")
  })

  it("uses the fixed durable finalization order", () => {
    expect(nextStageAfterS8()).toBe("S9")
    expect(nextStageAfterS9()).toBe("S10")
  })
})
