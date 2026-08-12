import { describe, expect, it } from "vitest"

import { isBehindHistoryCursor, compareHistoryOrder } from "@/lib/history/ordering"
import { earliestResumableStage } from "@/lib/history/resume"
import { compareOperationCandidates } from "@/lib/operations/selection"
import { buildAccountDeletionPlan } from "@/lib/privacy/deletion-plan"
import { retentionDueAt, shouldDeleteForRetention } from "@/lib/privacy/retention"

describe("M10 retention boundaries", () => {
  const createdAt = new Date("2030-01-01T12:00:00.000Z")

  it("anchors bounded retention to the original creation instant", () => {
    const due = retentionDueAt("30d", createdAt, "analyzing", new Date("2040-01-01"))
    expect(due?.toISOString()).toBe("2030-01-31T12:00:00.000Z")
    expect(
      shouldDeleteForRetention("30d", "analyzing", createdAt, new Date(due!.getTime() - 1)),
    ).toBe(false)
    expect(shouldDeleteForRetention("30d", "analyzing", createdAt, due!)).toBe(true)
  })

  it("schedules delete-on-complete only for complete analyses", () => {
    const now = new Date("2030-02-01T00:00:00.000Z")
    expect(retentionDueAt("delete_on_complete", createdAt, "partial", now)).toBeNull()
    expect(retentionDueAt("delete_on_complete", createdAt, "failed", now)).toBeNull()
    expect(retentionDueAt("delete_on_complete", createdAt, "complete", now)).toEqual(now)
  })
})

describe("M10 deletion propagation", () => {
  it("creates one unique analysis cleanup per owned analysis and a final account cleanup", () => {
    const plan = buildAccountDeletionPlan("owner", ["a1", "a2"])
    expect(plan.revokeAnalysisIds).toEqual(["a1", "a2"])
    expect(plan.cancelAnalysisIds).toEqual(["a1", "a2"])
    expect(plan.cleanupJobs).toEqual([
      { analysisId: "a1", dedupeKey: "analysis-cleanup:a1" },
      { analysisId: "a2", dedupeKey: "analysis-cleanup:a2" },
    ])
    expect(plan.accountCleanupDedupeKey).toBe("account-cleanup:owner")
  })
})

describe("M10 history and resume", () => {
  it("orders equal timestamps by descending UUID and applies the matching cursor boundary", () => {
    const createdAt = new Date("2030-01-01T00:00:00.000Z")
    const rows = [
      { createdAt, id: "00000000-0000-4000-8000-000000000001" },
      { createdAt, id: "00000000-0000-4000-8000-000000000002" },
    ].sort(compareHistoryOrder)
    expect(rows.map(({ id }) => id)).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ])
    expect(isBehindHistoryCursor(rows[1], rows[0])).toBe(true)
    expect(isBehindHistoryCursor(rows[0], rows[0])).toBe(false)
  })

  it("resumes the earliest incomplete stage without revisiting completed output", () => {
    const latest = new Map([
      ["S1", "complete"],
      ["S2", "complete"],
      ["S3", "failed"],
      ["S10", "complete"],
    ] as const)
    expect(earliestResumableStage(latest)).toBe("S3")
  })
})

describe("M10 operation selection", () => {
  it("prioritizes cleanup before both export types and then stable time/id order", () => {
    const now = new Date("2030-01-01T00:00:00.000Z")
    const jobs = [
      { type: "account_data_export" as const, availableAt: now, createdAt: now, id: "e" },
      { type: "report_export" as const, availableAt: now, createdAt: now, id: "d" },
      { type: "account_cleanup" as const, availableAt: now, createdAt: now, id: "b" },
      { type: "analysis_cleanup" as const, availableAt: now, createdAt: now, id: "c" },
      { type: "analysis_cleanup" as const, availableAt: now, createdAt: now, id: "a" },
    ].sort(compareOperationCandidates)
    expect(jobs.map(({ id }) => id)).toEqual(["a", "c", "b", "d", "e"])
  })
})
