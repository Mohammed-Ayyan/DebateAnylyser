import { describe, expect, it } from "vitest"

import { accountArtifactKey, reportArtifactKey } from "@/lib/exports/artifact-keys"
import {
  assertSafeAccountExport,
  findForbiddenAccountExportPath,
  projectAccountData,
} from "@/lib/exports/account-projector"
import { buildHtmlArtifact } from "@/lib/exports/worker"
import { accountDataExportJobValues, reportExportJobValues } from "@/lib/exports/job-payload"
import { publicShareHeaders } from "@/lib/shares/headers"
import {
  digestShareToken,
  generateShareToken,
  isActiveShare,
  redactSharedBearerPath,
} from "@/lib/shares/security"
import type { RenderHtmlReportInput } from "@/lib/exports/render-html"
import type { AssembledAnalysis } from "@/lib/contracts/analysis"

const ownerId = "00000000-0000-4000-8000-000000000001"
const analysisId = "00000000-0000-4000-8000-000000000002"
const exportId = "00000000-0000-4000-8000-000000000003"

describe("F12 share bearer security", () => {
  it("creates a 32-byte base64url token and stable SHA-256 digest", () => {
    const token = generateShareToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, "base64url")).toHaveLength(32)
    expect(digestShareToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(digestShareToken(token)).not.toContain(token)
  })

  it("fails closed for expiry or revocation", () => {
    const now = new Date("2030-01-01T00:00:00.000Z")
    expect(isActiveShare({ status: "active", revokedAt: null, expiresAt: null }, now)).toBe(true)
    expect(isActiveShare({ status: "active", revokedAt: null, expiresAt: now }, now)).toBe(false)
    expect(isActiveShare({ status: "revoked", revokedAt: now, expiresAt: null }, now)).toBe(false)
  })

  it("redacts bearer path segments and defines anti-indexing headers", () => {
    expect(redactSharedBearerPath("/api/v1/shared/top-secret-token")).toBe(
      "/api/v1/shared/[REDACTED]",
    )
    expect(redactSharedBearerPath("/shared/top-secret-token")).toBe("/shared/[REDACTED]")
    expect(publicShareHeaders["Cache-Control"]).toBe("no-store")
    expect(publicShareHeaders["Referrer-Policy"]).toBe("no-referrer")
    expect(publicShareHeaders["X-Robots-Tag"]).toContain("noindex")
    expect(publicShareHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'none'")
  })
})
describe("F12 account export deep allow-list", () => {
  it("projects only owner basics, metadata, owner content, and explicitly included transcript fields", () => {
    const projected = projectAccountData({
      generatedAt: "2030-01-01T00:00:00.000Z",
      account: {
        id: ownerId,
        email: "owner@example.test",
        createdAt: new Date("2029-01-01T00:00:00.000Z"),
        defaultRetentionSetting: "keep",
        preferences: {
          confidenceDisplay: "categorical",
          jargonPlainLanguage: true,
          readingDensity: "comfortable",
          accessibilityPrefs: { reduced_motion: true },
        },
        authProviderRef: "FORBIDDEN_PROVIDER_REF",
      } as never,
      analyses: [
        {
          id: analysisId,
          title: "Owned analysis",
          status: "complete",
          sourceType: "paste",
          language: "en",
          retentionSetting: "keep",
          createdAt: new Date("2029-02-01T00:00:00.000Z"),
          updatedAt: new Date("2029-02-02T00:00:00.000Z"),
          annotations: [
            { findingId: null, note: "Owner note", visibility: "shown", highlighted: false },
          ],
          contests: [],
          transcript: [
            {
              startMs: 1,
              endMs: 2,
              text: "Allowed text",
              speakerLabel: "Speaker A",
              asrConfidence: 0.99,
            },
          ] as never,
          sourceUrl: "https://private.example.test",
          tokenHash: "FORBIDDEN_HASH",
        } as never,
      ],
    })
    const json = JSON.stringify(projected)
    expect(json).toContain("Allowed text")
    expect(json).toContain("Speaker A")
    expect(json).not.toContain("FORBIDDEN_PROVIDER_REF")
    expect(json).not.toContain("FORBIDDEN_HASH")
    expect(json).not.toContain("private.example.test")
    expect(json).not.toContain("asrConfidence")
    expect(findForbiddenAccountExportPath(projected)).toBeNull()
    expect(() => assertSafeAccountExport({ nested: { auth_provider_ref: "x" } })).toThrow(
      /ACCOUNT_EXPORT_FORBIDDEN_FIELD/,
    )
  })
})
describe("F12 immutable report artifact", () => {
  it("builds strict durable jobs for both export kinds", () => {
    expect(reportExportJobValues(ownerId, analysisId, exportId)).toEqual({
      type: "report_export",
      ownerId,
      analysisId,
      dedupeKey: `report-export:${exportId}`,
      payload: { export_id: exportId },
    })
    expect(accountDataExportJobValues(ownerId, exportId, true)).toEqual({
      type: "account_data_export",
      ownerId,
      dedupeKey: `account-data-export:${exportId}`,
      payload: { export_id: exportId, include_transcript: true },
    })
  })

  it("renders real HTML bytes and deterministic immutable object keys", () => {
    const assembled: AssembledAnalysis = {
      overview: {
        categorical_read: "insufficient",
        distribution: {
          claims: 0,
          support_present: 0,
          support_weak: 0,
          support_absent: 0,
          support_insufficient: 0,
          verified_sources: 0,
          possible_patterns: 0,
        },
        top_insight: "No publishable findings are available.",
        explore_pointers: [],
      },
      findings: [],
      sources: [],
      structure_edges: [],
      stage_runs: [{ stage: "S9", status: "complete", attempt: 1, error_class: null }],
    }
    const input: RenderHtmlReportInput = {
      analysis: assembled,
      title: "Report",
      analysis_id: analysisId,
      generated_at: "2030-01-01T00:00:00.000Z",
      disclaimer_text: "Review the limitations.",
      disclaimer_version: "v1",
      limitations_url: "https://example.test/limitations",
    }
    const html = new TextDecoder().decode(buildHtmlArtifact(input))
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("No publishable findings are available.")
    expect(reportArtifactKey(ownerId, analysisId, exportId)).toContain(`${exportId}/report.html`)
    expect(accountArtifactKey(ownerId, exportId)).toContain(`${exportId}/account-data.json`)
  })
})
