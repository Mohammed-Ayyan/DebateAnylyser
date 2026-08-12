export type FixedRateLimitClass = "A" | "B" | "C" | "P"
export type RateLimitClass = FixedRateLimitClass | "D"

export type FixedWindowPolicy = {
  kind: "fixed-window"
  limit: number
  windowSeconds: number
}

export type ConcurrentPolicy = {
  kind: "concurrent"
  limit: number
  leaseSeconds: number
}

export type RateLimitPolicy = FixedWindowPolicy | ConcurrentPolicy

export const RATE_LIMIT_NAMES: Record<RateLimitClass, string> = {
  A: "expensive",
  B: "write",
  C: "read",
  D: "stream",
  P: "public",
}
