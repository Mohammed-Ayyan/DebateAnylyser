import { describe, expect, it } from "vitest"

import { AppError } from "@/lib/errors/app-error"
import {
  ALLOWED_UPLOADS,
  hashSubmission,
  normalizeFilename,
  parseAnalysisSubmission,
  parseIdempotencyKey,
  parseUploadRequest,
} from "@/lib/ingest/contracts"
import { resolveIdempotentReplay } from "@/lib/ingest/idempotency"

const rights = { rights_basis: "owned" as const, intended_use: "education" as const }

function expectStatus(action: () => unknown, status: number, code: string): void {
  try {
    action()
    throw new Error("Expected request validation to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ status, code })
  }
}

describe("F1 upload contract", () => {
  it("accepts every exact MIME/extension pair at the byte boundaries", () => {
    for (const pair of ALLOWED_UPLOADS) {
      const minimum = parseUploadRequest(
        {
          filename: `debate${pair.extension}`,
          content_type: pair.contentType,
          size: 1,
          ...rights,
        },
        10,
      )
      const maximum = parseUploadRequest({ ...minimum, size: 10 }, 10)
      expect(maximum.size).toBe(10)
    }
  })

  it("rejects oversized files and mismatched MIME/extension pairs", () => {
    expectStatus(
      () =>
        parseUploadRequest(
          { filename: "debate.pdf", content_type: "application/pdf", size: 11, ...rights },
          10,
        ),
      413,
      "PAYLOAD_TOO_LARGE",
    )

    expectStatus(
      () =>
        parseUploadRequest(
          { filename: "debate.pdf", content_type: "text/plain", size: 10, ...rights },
          10,
        ),
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    )
  })

  it("normalizes path-like, control, and unsafe filename content", () => {
    expect(normalizeFilename("../../folder\\bad\u0000?.PDF")).toBe("bad_.PDF")
    const longName = `${"a".repeat(300)}.txt`
    const normalized = normalizeFilename(longName)
    expect(normalized).toHaveLength(255)
    expect(normalized.endsWith(".txt")).toBe(true)
  })
})

describe("F1 source envelope", () => {
  it("enforces the discriminated union and explicit rights declarations", () => {
    expectStatus(
      () =>
        parseAnalysisSubmission(
          {
            source_type: "url",
            url: "https://example.com/debate",
            paste_text: "must not coexist",
            access: "public",
            retrieval_method: "direct_fetch",
            ...rights,
          },
          100,
        ),
      400,
      "INVALID_REQUEST",
    )
    expectStatus(
      () => parseAnalysisSubmission({ source_type: "paste", paste_text: "text" }, 100),
      400,
      "INVALID_REQUEST",
    )
  })

  it("trims paste input and enforces character boundaries", () => {
    const parsed = parseAnalysisSubmission(
      { source_type: "paste", paste_text: "  abc  ", ...rights },
      3,
    )
    expect(parsed).toMatchObject({ source_type: "paste", paste_text: "abc" })
    expectStatus(
      () => parseAnalysisSubmission({ source_type: "paste", paste_text: "abcd", ...rights }, 3),
      413,
      "PAYLOAD_TOO_LARGE",
    )
  })
})

describe("F1 idempotency contract", () => {
  it("validates keys and hashes normalized requests deterministically", () => {
    expect(parseIdempotencyKey(null)).toBeUndefined()
    expect(parseIdempotencyKey("retry-1")).toBe("retry-1")
    expectStatus(() => parseIdempotencyKey("contains space"), 400, "INVALID_REQUEST")
    const left = hashSubmission({
      source_type: "paste",
      paste_text: "abc",
      retention_setting: "keep",
      ...rights,
    })
    const right = hashSubmission({
      intended_use: "education",
      retention_setting: "keep",
      paste_text: "abc",
      rights_basis: "owned",
      source_type: "paste",
    })
    expect(left).toBe(right)
  })

  it("replays identical requests and rejects key reuse with changed input", () => {
    const record = {
      requestHash: "request-a",
      responseBody: { id: "analysis-id", status: "queued" },
    }
    expect(resolveIdempotentReplay(record, "request-a")).toEqual({
      id: "analysis-id",
      status: "queued",
    })
    expectStatus(() => resolveIdempotentReplay(record, "request-b"), 409, "IDEMPOTENCY_CONFLICT")
  })
})
