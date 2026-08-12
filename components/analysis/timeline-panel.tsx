"use client"

import { useEffect, useMemo, useState } from "react"

import type { AssembledPublicFinding } from "@/lib/contracts/analysis"
import { timelineResponseSchema, type TimelinePoint } from "@/lib/contracts/timeline"

type Segment = { id: string; start_ms: number; speaker_label: string | null }

function timeLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export function TimelinePanel({
  analysisId,
  findings,
  segments,
  onSelect,
}: {
  analysisId: string | null
  findings: readonly AssembledPublicFinding[]
  segments: readonly Segment[]
  onSelect: (finding: AssembledPublicFinding, segmentId: string) => void
}) {
  const [points, setPoints] = useState<TimelinePoint[]>([])
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  useEffect(() => {
    if (!analysisId) return
    const controller = new AbortController()
    void fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/timeline`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Timeline unavailable")
        setPoints(timelineResponseSchema.parse(await response.json()).points)
        setStatus("ready")
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error")
      })
    return () => controller.abort()
  }, [analysisId])

  const entries = useMemo(() => {
    const findingsById = new Map(findings.map((finding) => [finding.id, finding]))
    const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))
    return points.flatMap((point) => {
      const finding = findingsById.get(point.finding_id)
      if (!finding) return []
      const segment = finding.span_refs
        .map((span) => segmentsById.get(span.segment_id))
        .find((candidate) => candidate?.start_ms === point.time_ms)
      return segment ? [{ point, finding, segment }] : []
    })
  }, [findings, points, segments])

  if (status === "loading")
    return <p className="border border-[#222] p-3 text-zinc-500">Loading traceable timeline…</p>
  if (status === "error")
    return (
      <p role="alert" className="border border-red-900 p-3 text-red-300">
        Timeline could not be loaded.
      </p>
    )
  if (entries.length === 0)
    return (
      <p className="border border-[#222] p-3 text-zinc-500">
        No post-S9 finding has a timed transcript anchor.
      </p>
    )
  return (
    <div className="space-y-2" aria-label="Finding timeline">
      <div className="text-[10px] font-bold uppercase text-zinc-500">
        TIMED FINDINGS ({entries.length})
      </div>
      {entries.map(({ point, finding, segment }) => (
        <button
          key={finding.id}
          type="button"
          onClick={() => onSelect(finding, segment.id)}
          className="w-full border border-[#222] bg-black p-2.5 text-left text-zinc-300 hover:border-white focus:border-white focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="uppercase text-white">{finding.kind}</span>
            <span className="text-zinc-500">{timeLabel(point.time_ms)}</span>
          </div>
          <p className="mt-1 line-clamp-2 leading-snug">{finding.text}</p>
          <div className="mt-1 text-[10px] text-zinc-500">
            {segment.speaker_label ?? "UNATTRIBUTED"}
          </div>
        </button>
      ))}
    </div>
  )
}
