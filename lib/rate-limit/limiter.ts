import "server-only"

import { createHash } from "node:crypto"

import type { NextRequest } from "next/server"

import type { AuthenticatedPrincipal } from "@/lib/auth/types"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import type { RateLimitBackend, StreamLease } from "./backend"
import type { FixedRateLimitClass, FixedWindowPolicy } from "./classes"
import { RATE_LIMIT_NAMES } from "./classes"
import { RedisRateLimitBackend } from "./redis-backend"

const backend = new RedisRateLimitBackend()

function fixedPolicy(rateClass: FixedRateLimitClass): FixedWindowPolicy {
  const limits = {
    A: serverEnv.RATE_LIMIT_A_PER_HOUR,
    B: serverEnv.RATE_LIMIT_B_PER_HOUR,
    C: serverEnv.RATE_LIMIT_C_PER_HOUR,
    P: serverEnv.RATE_LIMIT_P_PER_HOUR,
  }
  return { kind: "fixed-window", limit: limits[rateClass], windowSeconds: 3600 }
}

function opaqueSubject(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function getRequestRateLimitSubject(
  request: NextRequest,
  principal?: AuthenticatedPrincipal,
): string {
  if (principal) return `user:${opaqueSubject(principal.userId)}`
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const address = request.headers.get("x-real-ip") ?? forwarded ?? "unknown"
  return `ip:${opaqueSubject(address.slice(0, 128))}`
}

function key(rateClass: string, subject: string): string {
  return `debate:rate:${rateClass}:${subject}`
}

export async function enforceRateLimit(
  rateClass: FixedRateLimitClass,
  subject: string,
  store: RateLimitBackend = backend,
): Promise<void> {
  const policy = fixedPolicy(rateClass)
  const result = await store.consume(key(rateClass, subject), policy.limit, policy.windowSeconds)
  if (!result.allowed) {
    throw new AppError({
      code: "RATE_LIMITED",
      status: 429,
      message: "Too many requests. Try again later.",
      expose: true,
      retryable: true,
      details: { retryAfterSeconds: result.retryAfterSeconds, class: RATE_LIMIT_NAMES[rateClass] },
    })
  }
}
export async function acquireStreamLimit(
  subject: string,
  store: RateLimitBackend = backend,
): Promise<StreamLease> {
  const lease = await store.acquireLease(
    key("D", subject),
    serverEnv.RATE_LIMIT_D_CONCURRENT,
    serverEnv.RATE_LIMIT_D_LEASE_SECONDS,
  )
  if (!lease) {
    throw new AppError({
      code: "STREAM_LIMITED",
      status: 429,
      message: "Too many active streams. Close another stream and retry.",
      expose: true,
      retryable: true,
      details: {
        retryAfterSeconds: serverEnv.RATE_LIMIT_D_LEASE_SECONDS,
        class: RATE_LIMIT_NAMES.D,
      },
    })
  }
  return lease
}
