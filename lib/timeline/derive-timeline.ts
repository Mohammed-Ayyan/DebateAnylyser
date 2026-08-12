import type {
  TimelineFindingInput,
  TimelinePoint,
  TimelineSegmentInput,
  TimelineSpanInput,
} from "@/lib/contracts/timeline"

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isValidAnchor(span: TimelineSpanInput, segment: TimelineSegmentInput): boolean {
  return (
    Number.isSafeInteger(segment.start_ms) &&
    Number.isSafeInteger(segment.end_ms) &&
    segment.start_ms >= 0 &&
    segment.end_ms >= segment.start_ms &&
    Number.isSafeInteger(span.start_char) &&
    Number.isSafeInteger(span.end_char) &&
    span.start_char >= 0 &&
    span.end_char > span.start_char &&
    span.end_char <= segment.text.length
  )
}

export function deriveTimelinePoints(
  findings: readonly TimelineFindingInput[],
  segments: readonly TimelineSegmentInput[],
): TimelinePoint[] {
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))
  const points = findings.flatMap((finding) => {
    const anchors = finding.span_refs
      .flatMap((span) => {
        const segment = segmentsById.get(span.segment_id)
        return segment && isValidAnchor(span, segment) ? [segment] : []
      })
      .sort((left, right) => left.start_ms - right.start_ms || compareText(left.id, right.id))
    const earliest = anchors[0]
    return earliest ? [{ time_ms: earliest.start_ms, finding_id: finding.id }] : []
  })

  return points.sort(
    (left, right) => left.time_ms - right.time_ms || compareText(left.finding_id, right.finding_id),
  )
}
