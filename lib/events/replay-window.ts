export type ReplayWindowDecision = "replay" | "reconcile-required"

export function assessReplayWindow(options: {
  cursor: bigint
  latestSequence: bigint
  retainedSequences: readonly bigint[]
  replayLimit: number
}): ReplayWindowDecision {
  const { cursor, latestSequence, retainedSequences, replayLimit } = options
  if (cursor > latestSequence) return "reconcile-required"
  if (retainedSequences.length > replayLimit) return "reconcile-required"
  if (cursor > 0n && retainedSequences[0] !== undefined && retainedSequences[0] > cursor + 1n) {
    return "reconcile-required"
  }
  if (latestSequence > cursor && retainedSequences.length === 0) return "reconcile-required"
  return "replay"
}
