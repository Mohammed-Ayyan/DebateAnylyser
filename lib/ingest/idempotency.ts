import { AppError } from "@/lib/errors/app-error"
import type { AnalysisCreatedResponse } from "./repository"

export type ExistingIdempotencyRecord = {
  requestHash: string
  responseBody: Record<string, unknown>
}

export function resolveIdempotentReplay(
  existing: ExistingIdempotencyRecord | undefined,
  requestHash: string,
): AnalysisCreatedResponse | undefined {
  if (!existing) return undefined
  if (existing.requestHash !== requestHash) {
    throw new AppError({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
      message: "This idempotency key was already used for a different request.",
      expose: true,
    })
  }
  const id = existing.responseBody.id
  const status = existing.responseBody.status
  if (typeof id !== "string" || status !== "queued") {
    throw new AppError({
      code: "IDEMPOTENCY_RECORD_INVALID",
      status: 500,
      message: "The stored idempotency response is invalid.",
    })
  }
  return { id, status }
}
