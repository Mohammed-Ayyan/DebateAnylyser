import { describe, expect, it } from "vitest"

import {
  historyListQuerySchema,
  historyListResponseSchema,
  historyPatchBodySchema,
  historyResumeResponseSchema,
} from "@/lib/history/contracts"
import { decodeHistoryCursor, encodeHistoryCursor } from "@/lib/history/cursor"

const id = "00000000-0000-4000-8000-000000000001"
const createdAt = "2026-07-05T10:20:30.000Z"
const statuses = ["queued", "transcribing", "analyzing", "partial", "complete", "failed"] as const

const item = {
  id,
  title: "A debate",
  status: "complete" as const,
  source_type: "upload" as const,
  retention_setting: "keep" as const,
  created_at: createdAt,
  updated_at: "2026-07-05T10:25:30.000Z",
}

describe("F11 history contracts", () => {
  it("normalizes list queries and enforces strict bounds", () => {
    expect(historyListQuerySchema.parse({ query: "  evidence  " })).toEqual({
      query: "evidence",
      limit: 25,
    })
    expect(historyListQuerySchema.parse({ limit: "100", cursor: "abc" }).limit).toBe(100)
    for (const status of statuses) {
      expect(historyListQuerySchema.parse({ status }).status).toBe(status)
    }

    expect(() => historyListQuerySchema.parse({ query: "x".repeat(201) })).toThrow()
    expect(() => historyListQuerySchema.parse({ limit: 101 })).toThrow()
    expect(() => historyListQuerySchema.parse({ limit: 0 })).toThrow()
    expect(() => historyListQuerySchema.parse({ unexpected: true })).toThrow()
  })

  it("validates strict list items and responses", () => {
    expect(historyListResponseSchema.parse({ items: [item], next_cursor: null })).toEqual({
      items: [item],
      next_cursor: null,
    })
    expect(() =>
      historyListResponseSchema.parse({
        items: [{ ...item, private_note: "no" }],
        next_cursor: null,
      }),
    ).toThrow()
    expect(() => historyListResponseSchema.parse({ items: [item] })).toThrow()
  })

  it("accepts only meaningful title or retention patches", () => {
    expect(historyPatchBodySchema.parse({ title: "  Renamed debate  " })).toEqual({
      title: "Renamed debate",
    })
    expect(historyPatchBodySchema.parse({ retention_setting: "90d" })).toEqual({
      retention_setting: "90d",
    })
    expect(historyPatchBodySchema.parse({ title: `  ${"x".repeat(200)}  ` }).title).toHaveLength(
      200,
    )

    expect(() => historyPatchBodySchema.parse({})).toThrow()
    expect(() => historyPatchBodySchema.parse({ title: "   " })).toThrow()
    expect(() => historyPatchBodySchema.parse({ title: "line\nbreak" })).toThrow()
    expect(() => historyPatchBodySchema.parse({ title: "nul\u0000byte" })).toThrow()
    expect(() => historyPatchBodySchema.parse({ title: "valid", extra: true })).toThrow()
  })

  it("validates strict resume responses", () => {
    expect(historyResumeResponseSchema.parse({ status: "queued" })).toEqual({ status: "queued" })
    expect(() => historyResumeResponseSchema.parse({ status: "unknown" })).toThrow()
    expect(() => historyResumeResponseSchema.parse({ status: "queued", id })).toThrow()
  })
})

describe("F11 opaque history cursors", () => {
  it("round-trips the timestamp and UUID as base64url", () => {
    const payload = { created_at: createdAt, id }
    const cursor = encodeHistoryCursor(payload)

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(cursor).not.toContain("=")
    expect(cursor).not.toContain(id)
    expect(decodeHistoryCursor(cursor)).toEqual(payload)
  })

  it("rejects malformed cursors with one stable public error", () => {
    const invalidCursors = [
      "not+base64url",
      "e30",
      btoa(JSON.stringify({ created_at: "not-a-date", id }))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
    ]

    for (const cursor of invalidCursors) {
      expect(() => decodeHistoryCursor(cursor)).toThrowError("Invalid cursor.")
    }
  })
})
