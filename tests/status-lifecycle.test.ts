import { describe, expect, it } from "vitest"

import {
  assertAnalysisTransition,
  assertStageTransition,
  deriveAnalysisOutcome,
  InvalidStatusTransitionError,
} from "@/lib/analysis/status-lifecycle"

describe("status lifecycle", () => {
  it("allows documented analysis progress and retry transitions", () => {
    expect(() => assertAnalysisTransition("queued", "transcribing")).not.toThrow()
    expect(() => assertAnalysisTransition("partial", "analyzing")).not.toThrow()
    expect(() => assertAnalysisTransition("failed", "queued")).not.toThrow()
  })

  it("rejects skipped states and terminal-state mutation", () => {
    expect(() => assertAnalysisTransition("queued", "complete")).toThrow(
      InvalidStatusTransitionError,
    )
    expect(() => assertAnalysisTransition("complete", "analyzing")).toThrow(
      InvalidStatusTransitionError,
    )
    expect(() => assertStageTransition("failed", "running")).toThrow(InvalidStatusTransitionError)
  })

  it("derives honest partial and failed outcomes", () => {
    expect(deriveAnalysisOutcome(["complete", "skipped"], 0)).toBe("complete")
    expect(deriveAnalysisOutcome(["complete", "failed"], 1)).toBe("partial")
    expect(deriveAnalysisOutcome(["failed"], 0)).toBe("failed")
    expect(() => deriveAnalysisOutcome(["running"], 0)).toThrow()
  })
})
