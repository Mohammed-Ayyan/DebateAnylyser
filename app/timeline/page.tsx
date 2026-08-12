"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard, AsciiSpinner } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import type { AssembledPublicFinding, PublicAnalysisResource } from "@/lib/contracts/analysis"
import { timelineResponseSchema, type TimelinePoint } from "@/lib/contracts/timeline"

type FilterType = "ALL" | "CLAIMS" | "FALLACIES" | "EVIDENCE"
type TranscriptSegment = {
  id: string
  start_ms: number
  end_ms: number
  text: string
  speaker_label: string | null
}
type TranscriptResponse = { segments: TranscriptSegment[] }
type TimelineEvent = {
  point: TimelinePoint
  finding: AssembledPublicFinding
  segment: TranscriptSegment
}

const FILTERS: FilterType[] = ["ALL", "CLAIMS", "FALLACIES", "EVIDENCE"]

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function findAnchorSegment(
  point: TimelinePoint,
  finding: AssembledPublicFinding,
  segmentsById: ReadonlyMap<string, TranscriptSegment>,
): TranscriptSegment | undefined {
  return finding.span_refs
    .flatMap((span) => {
      const segment = segmentsById.get(span.segment_id)
      return segment && segment.start_ms === point.time_ms && span.end_char <= segment.text.length
        ? [segment]
        : []
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))[0]
}

export default function TimelinePage() {
  const [filterType, setFilterType] = useState<FilterType>("ALL")
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PublicAnalysisResource | null>(null)
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null)
  const [points, setPoints] = useState<TimelinePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError("")
    const id = new URL(window.location.href).searchParams.get("analysis")
    if (!id) {
      setError("No analysis identifier was provided.")
      setLoading(false)
      return
    }
    setAnalysisId(id)
    const controller = new AbortController()

    const load = async () => {
      try {
        const basePath = `/api/v1/analyses/${encodeURIComponent(id)}`
        const [analysisResponse, transcriptResponse, timelineResponse] = await Promise.all([
          fetch(basePath, { credentials: "same-origin", signal: controller.signal }),
          fetch(`${basePath}/transcript`, {
            credentials: "same-origin",
            signal: controller.signal,
          }),
          fetch(`${basePath}/timeline`, {
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ])
        if (!analysisResponse.ok) throw new Error("The assembled analysis is unavailable.")
        if (!transcriptResponse.ok) throw new Error("The transcript is unavailable.")
        if (!timelineResponse.ok) throw new Error("The timeline is unavailable.")

        const nextAnalysis = (await analysisResponse.json()) as PublicAnalysisResource
        const nextTranscript = (await transcriptResponse.json()) as TranscriptResponse
        const nextTimeline = timelineResponseSchema.parse(await timelineResponse.json())
        setAnalysis(nextAnalysis)
        setTranscript(nextTranscript)
        setPoints(nextTimeline.points)
        setError("")
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(
          loadError instanceof Error ? loadError.message : "The timeline could not be loaded.",
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [reloadKey])

  const events = useMemo(() => {
    const findingsById = new Map((analysis?.findings ?? []).map((finding) => [finding.id, finding]))
    const segmentsById = new Map(
      (transcript?.segments ?? []).map((segment) => [segment.id, segment]),
    )
    return points.flatMap((point): TimelineEvent[] => {
      const finding = findingsById.get(point.finding_id)
      if (!finding) return []
      const segment = findAnchorSegment(point, finding, segmentsById)
      return segment ? [{ point, finding, segment }] : []
    })
  }, [analysis, points, transcript])

  const filtered = events.filter(({ finding }) => {
    if (filterType === "CLAIMS") return finding.kind === "claim"
    if (filterType === "FALLACIES") return finding.kind === "fallacy"
    if (filterType === "EVIDENCE") return finding.evidence_refs.length > 0
    return true
  })

  return (
    <AppShell>
      <div className="space-y-6 font-mono text-xs">
        <div className="p-4 border border-[#262626] bg-[#080808] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
              [CHRONOLOGICAL MATRIX]
            </div>
            <h1 className="text-xl font-bold uppercase text-white mt-1">
              Interactive Debate Timeline
            </h1>
            {analysis && <p className="mt-1 text-[10px] text-zinc-500">{analysis.title}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2" aria-label="Timeline filters">
            {FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                aria-pressed={filterType === type}
                className={`px-3 py-1 border uppercase text-[10px] transition-colors ${
                  filterType === type
                    ? "bg-white text-black font-bold border-white"
                    : "bg-black text-zinc-400 border-[#333] hover:text-white"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#262626]">
          {loading && (
            <AsciiCard className="flex items-center gap-2 text-zinc-400">
              <AsciiSpinner /> LOADING TIMELINE DATA...
            </AsciiCard>
          )}
          {!loading && error && (
            <AnalysisState
              kind="error"
              title="Timeline unavailable"
              description={error}
              action={
                analysisId ? (
                  <button
                    type="button"
                    onClick={() => setReloadKey((value) => value + 1)}
                    className="min-h-10 border border-white px-3 font-bold text-white"
                  >
                    RETRY
                  </button>
                ) : undefined
              }
            />
          )}
          {!loading && !error && filtered.length === 0 && (
            <AsciiCard className="text-zinc-400">
              {events.length === 0
                ? "[EMPTY] No traceable post-assembly findings have timed transcript anchors."
                : `[EMPTY] No ${filterType.toLowerCase()} timeline points are available.`}
            </AsciiCard>
          )}
          {!loading &&
            !error &&
            filtered.map(({ point, finding, segment }) => (
              <div key={finding.id} className="relative group">
                <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full bg-black border-2 border-white group-hover:scale-125 transition-transform motion-reduce:transition-none" />

                <Link
                  href={`/workspace?analysis=${encodeURIComponent(analysisId ?? "")}&finding=${encodeURIComponent(finding.id)}&segment=${encodeURIComponent(segment.id)}`}
                  className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  aria-label={`Open ${finding.kind} finding at ${formatTime(point.time_ms)} in workspace`}
                >
                  <AsciiCard className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-[10px] border-b border-[#1a1a1a] pb-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-white uppercase">
                          {segment.speaker_label ?? finding.claim?.speaker_label ?? "UNATTRIBUTED"}
                        </span>
                        <AsciiBadge
                          variant={finding.kind === "fallacy" ? "destructive" : "default"}
                        >
                          {finding.kind}
                        </AsciiBadge>
                      </div>
                      <span className="shrink-0 text-zinc-500">{formatTime(point.time_ms)}</span>
                    </div>

                    <h4 className="text-xs font-bold uppercase text-white">
                      {finding.kind} finding
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">{finding.text}</p>
                  </AsciiCard>
                </Link>
              </div>
            ))}
        </div>
      </div>
    </AppShell>
  )
}
