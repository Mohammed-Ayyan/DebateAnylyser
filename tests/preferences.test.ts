import { describe, expect, it } from "vitest"

import { updatePreferencesSchema } from "@/lib/auth/preferences"

describe("F13 settings contract", () => {
  it("accepts categorical confidence and allow-listed accessibility preferences", () => {
    expect(
      updatePreferencesSchema.parse({
        confidence_display: "categorical",
        jargon_plain_language: true,
        reading_density: "low_density",
        accessibility_prefs: { reduced_motion: true },
      }),
    ).toEqual({
      confidence_display: "categorical",
      jargon_plain_language: true,
      reading_density: "low_density",
      accessibility_prefs: { reduced_motion: true },
    })
  })

  it("rejects legacy numeric confidence and unknown preference keys", () => {
    expect(updatePreferencesSchema.safeParse({ confidence_display: "numeric_optin" }).success).toBe(
      false,
    )
    expect(
      updatePreferencesSchema.safeParse({ accessibility_prefs: { font_upload: true } }).success,
    ).toBe(false)
  })
})
