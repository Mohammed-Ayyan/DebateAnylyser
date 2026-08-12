import type { AnalysisEvent } from "@/lib/contracts/events"

const maxPostgresBigint = 9_223_372_036_854_775_807n

export function parseEventCursor(value: string | null): bigint {
  if (value === null || value === "") return 0n
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("Invalid Last-Event-ID")
  const cursor = BigInt(value)
  if (cursor > maxPostgresBigint) throw new Error("Last-Event-ID exceeds the supported range")
  return cursor
}

export function shouldEmitPublicAnalysisEvent(event: AnalysisEvent): boolean {
  return event.type !== "finding.batch" || event.stage === "S10"
}

export function encodeSseEvent(sequence: bigint, event: AnalysisEvent): string {
  return `id: ${sequence.toString()}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

export const SSE_HEARTBEAT = ": heartbeat\n\n"
