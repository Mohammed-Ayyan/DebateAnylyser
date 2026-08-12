import { describe, expect, it } from "vitest"

import { timelineResponseSchema } from "@/lib/contracts/timeline"
import { deriveTimelinePoints } from "@/lib/timeline/derive-timeline"

const findingA = "00000000-0000-4000-8000-00000000000a"
const findingB = "00000000-0000-4000-8000-00000000000b"
const findingC = "00000000-0000-4000-8000-00000000000c"
const segmentA = "00000000-0000-4000-8000-000000000001"
const segmentB = "00000000-0000-4000-8000-000000000002"

const segments = [
  { id: segmentA, start_ms: 4_000, end_ms: 5_000, text: "later words" },
  { id: segmentB, start_ms: 1_000, end_ms: 2_000, text: "early words" },
]

describe("deriveTimelinePoints", () => {
  it("uses the earliest valid anchored segment for each finding", () => {
    expect(
      deriveTimelinePoints(
        [
          {
            id: findingA,
            span_refs: [
              { segment_id: segmentA, start_char: 0, end_char: 5 },
              { segment_id: segmentB, start_char: 0, end_char: 5 },
            ],
          },
        ],
        segments,
      ),
    ).toEqual([{ time_ms: 1_000, finding_id: findingA }])
  })

  it("drops findings without a span anchored inside a valid transcript segment", () => {
    expect(
      deriveTimelinePoints(
        [
          { id: findingA, span_refs: [] },
          {
            id: findingB,
            span_refs: [{ segment_id: segmentA, start_char: 0, end_char: 99 }],
          },
          {
            id: findingC,
            span_refs: [
              {
                segment_id: "00000000-0000-4000-8000-000000000099",
                start_char: 0,
                end_char: 2,
              },
            ],
          },
        ],
        segments,
      ),
    ).toEqual([])
  })

  it("sorts by time then finding id and returns only the public point fields", () => {
    const points = deriveTimelinePoints(
      [
        {
          id: findingC,
          span_refs: [{ segment_id: segmentB, start_char: 0, end_char: 5 }],
        },
        {
          id: findingA,
          span_refs: [{ segment_id: segmentB, start_char: 0, end_char: 5 }],
        },
        {
          id: findingB,
          span_refs: [{ segment_id: segmentA, start_char: 0, end_char: 5 }],
        },
      ],
      segments,
    )

    expect(points).toEqual([
      { time_ms: 1_000, finding_id: findingA },
      { time_ms: 1_000, finding_id: findingC },
      { time_ms: 4_000, finding_id: findingB },
    ])
    expect(timelineResponseSchema.parse({ points })).toEqual({ points })
    expect(() => timelineResponseSchema.parse({ points, score: 1 })).toThrow()
  })
})
