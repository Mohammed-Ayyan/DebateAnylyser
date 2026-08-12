import "server-only"

import { getDatabase } from "@/lib/db/client"
import { injectionFlags } from "@/lib/db/schema"
import type { InjectionSignal } from "./injection-detector"

export async function recordInjectionFlags(
  analysisId: string,
  signals: readonly InjectionSignal[],
  segmentId?: string,
): Promise<void> {
  if (signals.length === 0) return
  await getDatabase()
    .insert(injectionFlags)
    .values(
      signals.map((signal) => ({
        analysisId,
        segmentId,
        signal: `${signal.code}:${signal.start}-${signal.end}`,
      })),
    )
}
