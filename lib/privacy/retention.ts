import type { AnalysisStatus } from "@/lib/contracts/analysis"
import type { RetentionSetting } from "./contracts"

const DAY_MS = 24 * 60 * 60 * 1_000

export function retentionDueAt(
  setting: RetentionSetting,
  createdAt: Date,
  status: AnalysisStatus,
  completedAt: Date,
): Date | null {
  if (setting === "keep") return null
  if (setting === "30d") return new Date(createdAt.getTime() + 30 * DAY_MS)
  if (setting === "90d") return new Date(createdAt.getTime() + 90 * DAY_MS)
  return status === "complete" ? completedAt : null
}

export function shouldDeleteForRetention(
  setting: RetentionSetting,
  status: AnalysisStatus,
  createdAt: Date,
  now: Date,
): boolean {
  const dueAt = retentionDueAt(setting, createdAt, status, now)
  return dueAt !== null && dueAt.getTime() <= now.getTime()
}
