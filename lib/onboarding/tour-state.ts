export const TOUR_VERSION = "2026.1"
export const TOUR_RESTART_KEY = "debate-analyser:tour:restart"
export const TOUR_SKIP_KEY = "debate-analyser:tour:skip"

export type TourStatus = "completed" | "dismissed"

export type TourRecord = {
  version: string
  status: TourStatus
  updatedAt: string
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function createTourScope(identity?: string | null) {
  if (!identity) return "browser"
  let hash = 2166136261
  for (const character of identity.trim().toLowerCase()) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `user-${(hash >>> 0).toString(36)}`
}

export function tourStorageKey(scope: string) {
  return `debate-analyser:tour:${TOUR_VERSION}:${scope}`
}

export function readTourRecord(storage: StorageLike, scope: string): TourRecord | null {
  try {
    const value = storage.getItem(tourStorageKey(scope))
    if (!value) return null
    const record = JSON.parse(value) as Partial<TourRecord>
    if (
      record.version !== TOUR_VERSION ||
      (record.status !== "completed" && record.status !== "dismissed") ||
      typeof record.updatedAt !== "string"
    ) {
      return null
    }
    return record as TourRecord
  } catch {
    return null
  }
}

export function writeTourRecord(
  storage: StorageLike,
  scope: string,
  status: TourStatus,
  now = new Date(),
) {
  const record: TourRecord = {
    version: TOUR_VERSION,
    status,
    updatedAt: now.toISOString(),
  }
  try {
    storage.setItem(tourStorageKey(scope), JSON.stringify(record))
  } catch {
    // Persistence is progressive enhancement; the tour must never block the app.
  }
  return record
}

export function shouldStartTour(input: {
  record: TourRecord | null
  historyKnown: boolean
  hasAnalyses: boolean
  manuallyRequested: boolean
}) {
  if (input.manuallyRequested) return true
  return input.historyKnown && !input.hasAnalyses && input.record === null
}

export function consumeRestartRequest(storage: StorageLike) {
  try {
    const requested = storage.getItem(TOUR_RESTART_KEY) === "true"
    if (requested) storage.removeItem(TOUR_RESTART_KEY)
    return requested
  } catch {
    return false
  }
}

export function consumeSkipRequest(storage: StorageLike) {
  try {
    const requested = storage.getItem(TOUR_SKIP_KEY) === "true"
    if (requested) storage.removeItem(TOUR_SKIP_KEY)
    return requested
  } catch {
    return false
  }
}
