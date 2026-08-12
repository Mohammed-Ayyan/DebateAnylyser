import "server-only"

import { serverEnv } from "@/lib/env/server"

export type PipelineStageTag = "S1" | "S2" | "S3" | "S4" | "S5" | "WORKER"

type PipelineEvent =
  | "START"
  | "INPUT"
  | "PROVIDER"
  | "VALIDATION"
  | "DB"
  | "COMPLETE"
  | "ERROR"
  | "RETRY"

function isEnabled(): boolean {
  return serverEnv.APP_ENV === "dev" || serverEnv.LOG_LEVEL === "debug"
}

function formatPairs(pairs: Record<string, unknown>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
}

/**
 * Development-only pipeline diagnostic logger.
 * Output format: [PIPELINE][S#][EVENT] message key=value
 *
 * Security: Never logs secrets, API keys, auth headers, full responses,
 * transcript content, or personal info. Logs only counts, IDs, statuses,
 * durations, HTTP status codes, error codes, and non-sensitive metadata.
 */
export function pipelineLog(
  stage: PipelineStageTag,
  event: PipelineEvent,
  message: string,
  pairs?: Record<string, unknown>,
): void {
  if (!isEnabled()) return
  const suffix = pairs ? ` ${formatPairs(pairs)}` : ""
  console.log(`[PIPELINE][${stage}][${event}] ${message}${suffix}`)
}

/** Returns current high-resolution millisecond timestamp for duration tracking. */
export function pipelineNow(): number {
  return performance.now()
}

/** Formats elapsed time for log output. */
export function pipelineElapsed(startMs: number): string {
  const elapsed = performance.now() - startMs
  return elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${Math.round(elapsed)}ms`
}
