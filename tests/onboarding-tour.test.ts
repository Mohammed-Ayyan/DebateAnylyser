import { describe, expect, it } from "vitest"

import {
  createTourScope,
  readTourRecord,
  shouldStartTour,
  TOUR_VERSION,
  writeTourRecord,
  type StorageLike,
} from "@/lib/onboarding/tour-state"

function memoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

describe("product tour persistence", () => {
  it("scopes records deterministically without storing the identity", () => {
    expect(createTourScope(" Person@Example.com ")).toBe(createTourScope("person@example.com"))
    expect(createTourScope("person@example.com")).not.toContain("person@example.com")
  })

  it("persists completion for the current tour version", () => {
    const storage = memoryStorage()
    const scope = createTourScope("person@example.com")
    writeTourRecord(storage, scope, "completed", new Date("2026-01-01T00:00:00.000Z"))

    expect(readTourRecord(storage, scope)).toEqual({
      version: TOUR_VERSION,
      status: "completed",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })
  })

  it("auto-starts only when history is known, empty, and no decision exists", () => {
    const base = { record: null, historyKnown: true, hasAnalyses: false, manuallyRequested: false }
    expect(shouldStartTour(base)).toBe(true)
    expect(shouldStartTour({ ...base, historyKnown: false })).toBe(false)
    expect(shouldStartTour({ ...base, hasAnalyses: true })).toBe(false)
    expect(
      shouldStartTour({
        ...base,
        record: { version: TOUR_VERSION, status: "dismissed", updatedAt: "now" },
      }),
    ).toBe(false)
    expect(shouldStartTour({ ...base, hasAnalyses: true, manuallyRequested: true })).toBe(true)
  })
})
