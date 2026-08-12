import { describe, expect, it } from "vitest"

import {
  createAnnotationSchema,
  isMeaningfulAnnotation,
  updateAnnotationSchema,
} from "@/lib/annotations/contracts"
import { createContestSchema } from "@/lib/contests/contracts"

const findingId = "00000000-0000-4000-8000-000000000001"

describe("M9 interaction contracts", () => {
  it("accepts bounded plain-text contest reasons and rejects unknown fields", () => {
    expect(createContestSchema.parse({ reason: "  The anchor omits context.  " })).toEqual({
      reason: "The anchor omits context.",
    })
    expect(() => createContestSchema.parse({ reason: "x".repeat(2_001) })).toThrow()
    expect(() =>
      createContestSchema.parse({ reason: "valid", resolution: "self-approved" }),
    ).toThrow()
  })

  it("requires annotations to contain a note or explicit curation state", () => {
    expect(
      createAnnotationSchema.parse({
        finding_id: findingId,
        note: "  Ask for supporting evidence. ",
      }),
    ).toMatchObject({ note: "Ask for supporting evidence." })
    expect(
      createAnnotationSchema.parse({ finding_id: findingId, visibility: "hidden" }),
    ).toMatchObject({ visibility: "hidden" })
    expect(() => createAnnotationSchema.parse({ finding_id: findingId })).toThrow()
    expect(isMeaningfulAnnotation({ note: null, visibility: "shown", highlighted: false })).toBe(
      false,
    )
  })

  it("keeps annotation text as inert data and requires non-empty strict patches", () => {
    const payload = `<script>alert("x")</script>`
    expect(createAnnotationSchema.parse({ note: payload }).note).toBe(payload)
    expect(() => updateAnnotationSchema.parse({})).toThrow()
    expect(() => updateAnnotationSchema.parse({ highlighted: true, winner: "speaker-a" })).toThrow()
  })
})
