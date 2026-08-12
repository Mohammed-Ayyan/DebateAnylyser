import { describe, expect, it } from "vitest"

import { assessReplayWindow } from "@/lib/events/replay-window"
import { encodeSseEvent, parseEventCursor, shouldEmitPublicAnalysisEvent } from "@/lib/events/sse"

describe("SSE cursor and encoding", () => {
  it("accepts canonical decimal cursors and rejects malformed values", () => {
    expect(parseEventCursor(null)).toBe(0n)
    expect(parseEventCursor("42")).toBe(42n)
    expect(() => parseEventCursor("01")).toThrow()
    expect(() => parseEventCursor("-1")).toThrow()
    expect(() => parseEventCursor("1.2")).toThrow()
  })

  it("encodes monotonic decimal IDs and typed event data", () => {
    const encoded = encodeSseEvent(7n, {
      type: "analysis.done",
      status: "partial",
    })
    expect(encoded).toContain("id: 7\n")
    expect(encoded).toContain("event: analysis.done\n")
    expect(encoded).toContain('"status":"partial"')
  })

  it("emits finding batches publicly only after S9 through S10", () => {
    expect(
      shouldEmitPublicAnalysisEvent({ type: "finding.batch", stage: "S7", findings: [] }),
    ).toBe(false)
    expect(
      shouldEmitPublicAnalysisEvent({ type: "finding.batch", stage: "S10", findings: [] }),
    ).toBe(true)
    expect(
      shouldEmitPublicAnalysisEvent({
        type: "stage.status",
        stage: "S8",
        status: "running",
        attempt: 1,
      }),
    ).toBe(true)
  })
})

describe("bounded replay decisions", () => {
  it("requires reconciliation for expired gaps, future cursors, and overflow", () => {
    expect(
      assessReplayWindow({
        cursor: 2n,
        latestSequence: 8n,
        retainedSequences: [6n, 7n, 8n],
        replayLimit: 10,
      }),
    ).toBe("reconcile-required")
    expect(
      assessReplayWindow({
        cursor: 9n,
        latestSequence: 8n,
        retainedSequences: [],
        replayLimit: 10,
      }),
    ).toBe("reconcile-required")
    expect(
      assessReplayWindow({
        cursor: 0n,
        latestSequence: 3n,
        retainedSequences: [1n, 2n, 3n],
        replayLimit: 2,
      }),
    ).toBe("reconcile-required")
  })

  it("replays a contiguous retained suffix", () => {
    expect(
      assessReplayWindow({
        cursor: 4n,
        latestSequence: 7n,
        retainedSequences: [5n, 6n, 7n],
        replayLimit: 10,
      }),
    ).toBe("replay")
  })
})
