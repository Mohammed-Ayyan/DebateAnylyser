"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { FileText, Printer, Search } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AnnotationControls } from "@/components/analysis/annotation-controls"
import { CoverageOverview } from "@/components/analysis/coverage-overview"
import { CategoricalConfidenceBadge } from "@/components/analysis/categorical-confidence-badge"
import { ContestControl } from "@/components/analysis/contest-control"
import { EvidenceDrawer } from "@/components/analysis/evidence-drawer"
import { FindingStateLabel } from "@/components/analysis/finding-state-label"
import { TimelinePanel } from "@/components/analysis/timeline-panel"
import { AsciiBadge } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import { annotationListSchema, type Annotation } from "@/lib/annotations/contracts"
import type { AssembledPublicFinding, PublicAnalysisResource } from "@/lib/contracts/analysis"

type TranscriptSegment = {
  id: string
  index: number
  start_ms: number
  end_ms: number
  text: string
  speaker_id: string | null
  speaker_label: string | null
  low_confidence: boolean
}
type TranscriptResponse = {
  speakers: Array<{ id: string; label: string; display_name: string | null }>
  segments: TranscriptSegment[]
}
type LeftTab = "claims" | "timeline" | "fallacies" | "speakers"
type RightTab = "evidence" | "sources" | "notes"
const LEFT_TABS: LeftTab[] = ["claims", "fallacies", "timeline", "speakers"]
const RIGHT_TABS: RightTab[] = ["evidence", "sources", "notes"]

function timeLabel(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export default function AnalysisWorkspacePage() {
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PublicAnalysisResource | null>(null)
  const [transcript, setTranscript] = useState<TranscriptResponse | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [activeLeftTab, setActiveLeftTab] = useState<LeftTab>("claims")
  const [activeRightTab, setActiveRightTab] = useState<RightTab>("evidence")
  const [searchQuery, setSearchQuery] = useState("")
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [status, setStatus] = useState<"loading" | "connected" | "reconnecting" | "error">(
    "loading",
  )
  const [error, setError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)
  const inspectorRef = useRef<HTMLElement>(null)
  const inspectorTriggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const params = new URL(window.location.href).searchParams
    const id = params.get("analysis")
    const requestedFindingId = params.get("finding")
    const requestedSegmentId = params.get("segment")
    if (!id) {
      setError("")
      setStatus("error")
      return
    }
    setAnalysisId(id)
    let active = true
    const load = async () => {
      try {
        const basePath = `/api/v1/analyses/${encodeURIComponent(id)}`
        const [analysisResponse, transcriptResponse, annotationResponse] = await Promise.all([
          fetch(basePath, { credentials: "same-origin" }),
          fetch(`${basePath}/transcript`, { credentials: "same-origin" }),
          fetch(`${basePath}/annotations`, { credentials: "same-origin" }),
        ])
        if (!analysisResponse.ok) throw new Error("The assembled analysis is unavailable.")
        if (!transcriptResponse.ok) throw new Error("The transcript is unavailable.")
        if (!annotationResponse.ok) throw new Error("The annotation workspace is unavailable.")
        const nextAnalysis = (await analysisResponse.json()) as PublicAnalysisResource
        const nextTranscript = (await transcriptResponse.json()) as TranscriptResponse
        const nextAnnotations = annotationListSchema.parse(await annotationResponse.json())
        if (!active) return
        setAnalysis(nextAnalysis)
        setTranscript(nextTranscript)
        setAnnotations(nextAnnotations.annotations)
        setSelectedFindingId(
          (current) =>
            current ??
            nextAnalysis.findings.find((finding) => finding.id === requestedFindingId)?.id ??
            nextAnalysis.findings[0]?.id ??
            null,
        )
        setSelectedSegmentId(
          (current) =>
            current ??
            nextTranscript.segments.find((segment) => segment.id === requestedSegmentId)?.id ??
            nextTranscript.segments[0]?.id ??
            null,
        )
        setStatus("connected")
        setError("")
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Analysis loading failed.")
        setStatus("error")
      }
    }
    void load()
    const stream = new EventSource(`/api/v1/analyses/${encodeURIComponent(id)}/stream`)
    stream.addEventListener("overview.ready", () => void load())
    stream.addEventListener("finding.batch", () => void load())
    stream.addEventListener("analysis.done", () => void load())
    stream.onopen = () => setStatus((current) => (current === "loading" ? current : "connected"))
    stream.onerror = () =>
      setStatus((current) => (current === "loading" ? current : "reconnecting"))
    return () => {
      active = false
      stream.close()
    }
  }, [reloadKey])

  useEffect(() => {
    if (!showClaimModal) return
    const dialog = inspectorRef.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    focusable()[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setShowClaimModal(false)
        return
      }
      if (event.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      inspectorTriggerRef.current?.focus()
    }
  }, [showClaimModal])

  const findings = analysis?.findings ?? []
  const claims = findings.filter((finding) => finding.kind === "claim")
  const fallacies = findings.filter((finding) => finding.kind === "fallacy")
  const relatedFindings = findings.filter(
    (finding) => finding.kind !== "claim" && finding.kind !== "fallacy",
  )
  const selectedFinding = findings.find((finding) => finding.id === selectedFindingId) ?? null
  const selectedAnnotation = annotations.find(
    (annotation) => annotation.finding_id === selectedFindingId,
  )
  const filteredTranscript = useMemo(
    () =>
      (transcript?.segments ?? []).filter(
        (line) =>
          line.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (line.speaker_label ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [searchQuery, transcript],
  )
  const selectedSources = (analysis?.sources ?? []).filter((source) =>
    selectedFinding?.evidence_refs.includes(source.id),
  )
  const selectFinding = (finding: AssembledPublicFinding, segmentId?: string) => {
    setSelectedFindingId(finding.id)
    setSelectedSegmentId(segmentId ?? finding.span_refs[0]?.segment_id ?? null)
  }
  const markContested = (findingId: string) => {
    setAnalysis((current) =>
      current
        ? {
            ...current,
            findings: current.findings.map((finding) =>
              finding.id === findingId ? { ...finding, state: "contested" } : finding,
            ),
          }
        : current,
    )
  }
  const updateAnnotationState = (annotation: Annotation | null) => {
    setAnnotations((current) => {
      const withoutSelected = current.filter((item) => item.finding_id !== selectedFindingId)
      return annotation ? [...withoutSelected, annotation] : withoutSelected
    })
  }

  return (
    <AppShell>
      <main className="flex min-h-[calc(100vh-6rem)] flex-col space-y-3 font-mono text-xs lg:h-[calc(100vh-6rem)] lg:min-h-0">
        <header className="print-visible flex shrink-0 flex-col gap-3 border border-[#262626] bg-[#080808] p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <span className="min-w-0 truncate text-sm font-bold uppercase text-white">
              {analysis?.title ?? "ANALYSIS WORKSPACE"}
            </span>
            {analysis?.title?.startsWith("DEMO") && (
              <AsciiBadge variant="warning">PRECOMPUTED</AsciiBadge>
            )}
            <AsciiBadge variant={analysis?.assembly_ready ? "success" : "warning"}>
              {analysis?.assembly_ready ? "ASSEMBLED" : "PROCESSING"}
            </AsciiBadge>
            <span className="no-print hidden text-[10px] text-zinc-500 md:inline-block">
              [{status.toUpperCase()} · TRACEABLE-OR-SILENT]
            </span>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <label className="no-print relative min-w-0 flex-1 xl:w-72">
              <span className="sr-only">Search transcript</span>
              <Search
                className="absolute left-3 top-3.5 h-3.5 w-3.5 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search transcript or speaker…"
                className="min-h-10 w-full border border-[#333] bg-black pl-9 pr-3 font-mono text-xs text-white outline-none focus:border-white"
              />
            </label>
            <button
              ref={inspectorTriggerRef}
              type="button"
              disabled={!selectedFinding}
              onClick={() => setShowClaimModal(true)}
              className="no-print min-h-10 border border-white bg-white px-3 font-bold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-[#333] disabled:bg-[#111] disabled:text-zinc-600 motion-reduce:transition-none"
            >
              OPEN FINDING INSPECTOR
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Opens your browser's print dialog. Choose 'Save as PDF' to download."
              className="no-print min-h-10 border border-[#555] bg-[#111] px-3 font-bold text-white transition-colors hover:border-white hover:bg-[#222] motion-reduce:transition-none"
            >
              <span className="flex items-center gap-2">
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">PRINT / PDF</span>
              </span>
            </button>
          </div>
        </header>
        {analysis?.title?.startsWith("DEMO") && (
          <div
            role="status"
            className="no-print border border-emerald-800/60 bg-emerald-950/30 p-3 text-center text-[11px] font-bold uppercase tracking-wider text-emerald-300"
          >
            DEMO — PRECOMPUTED ANALYSIS · No live providers were called
          </div>
        )}
        {status === "loading" && !analysis && (
          <AnalysisState
            kind="loading"
            title="Loading analysis workspace"
            description="Retrieving transcript, findings, source relationships, and your saved annotations."
          />
        )}
        {!analysisId && status === "error" && !error && (
          <AnalysisState
            kind="empty"
            title="Choose an analysis workspace"
            description="Workspaces are analysis-specific. Select a retained run to review its transcript, findings, sources, and annotations."
            action={
              <Link
                href="/history"
                className="inline-flex min-h-10 items-center bg-white px-4 font-bold text-black"
              >
                OPEN ANALYSIS HISTORY
              </Link>
            }
          />
        )}
        {error && (
          <AnalysisState
            kind="error"
            title="Workspace unavailable"
            description={error}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="min-h-10 border border-white px-3 font-bold text-white"
              >
                RETRY
              </button>
            }
          />
        )}
        {analysis && <CoverageOverview overview={analysis.overview} />}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="flex min-h-0 flex-col border border-[#262626] bg-black lg:col-span-3">
            <div
              role="tablist"
              aria-label="Workspace finding views"
              className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#262626] bg-[#0c0c0c] px-2"
            >
              {LEFT_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  id={`workspace-left-tab-${tab}`}
                  role="tab"
                  aria-selected={activeLeftTab === tab}
                  aria-controls={`workspace-left-panel-${tab}`}
                  tabIndex={activeLeftTab === tab ? 0 : -1}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                    const index = LEFT_TABS.indexOf(tab)
                    const offset = event.key === "ArrowRight" ? 1 : -1
                    const next = LEFT_TABS[(index + offset + LEFT_TABS.length) % LEFT_TABS.length]
                    setActiveLeftTab(next)
                    document.getElementById(`workspace-left-tab-${next}`)?.focus()
                  }}
                  onClick={() => setActiveLeftTab(tab)}
                  className={`border px-2.5 py-1 text-[10px] uppercase transition-colors ${
                    activeLeftTab === tab
                      ? "border-white bg-white font-bold text-black"
                      : "border-transparent bg-transparent text-zinc-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div
              id={`workspace-left-panel-${activeLeftTab}`}
              role="tabpanel"
              aria-labelledby={`workspace-left-tab-${activeLeftTab}`}
              className="flex-1 space-y-2 overflow-y-auto p-3"
            >
              {activeLeftTab === "claims" && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-500">
                    <span>EXTRACTED CLAIMS</span>
                    <span>[{claims.length}]</span>
                  </div>
                  {claims.length === 0 && (
                    <p className="border border-[#222] p-3 text-zinc-500">
                      {analysis?.assembly_ready
                        ? "No traceable claims are available."
                        : "S9 assembly is pending."}
                    </p>
                  )}
                  {claims.map((claim) => (
                    <button
                      key={claim.id}
                      type="button"
                      onClick={() => selectFinding(claim)}
                      className={`w-full border p-2.5 text-left transition-all ${
                        selectedFinding?.id === claim.id
                          ? "border-white bg-[#141414] font-bold text-white"
                          : "border-[#222] bg-black text-zinc-400 hover:border-[#444]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span>{claim.claim?.speaker_label ?? "UNATTRIBUTED SPEAKER"}</span>
                        <FindingStateLabel state={claim.state} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-snug text-white">
                        {claim.text}
                      </p>
                      <div className="mt-2 border-t border-[#1a1a1a] pt-1">
                        <CategoricalConfidenceBadge band={claim.confidence_band} />
                      </div>
                    </button>
                  ))}
                  {relatedFindings.length > 0 && (
                    <div className="space-y-2 border-t border-[#262626] pt-3">
                      <div className="text-[10px] font-bold uppercase text-zinc-500">
                        RELATED FINDINGS ({relatedFindings.length})
                      </div>
                      {relatedFindings.map((finding) => {
                        const annotation = annotations.find(
                          (item) => item.finding_id === finding.id,
                        )
                        return (
                          <button
                            key={finding.id}
                            type="button"
                            onClick={() => selectFinding(finding)}
                            className={`w-full border p-2.5 text-left ${
                              selectedFinding?.id === finding.id
                                ? "border-white bg-[#141414]"
                                : "border-[#222] bg-black hover:border-[#444]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] uppercase text-zinc-500">
                              <span>{finding.kind}</span>
                              <FindingStateLabel state={finding.state} />
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-white">{finding.text}</p>
                            {annotation && (
                              <div className="mt-1 text-[10px] text-amber-300">
                                {annotation.visibility === "hidden" ? "HIDDEN · " : ""}
                                {annotation.highlighted ? "HIGHLIGHTED" : "CURATED"}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {activeLeftTab === "fallacies" && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold uppercase text-zinc-500">
                    POSSIBLE PATTERNS ({fallacies.length})
                  </div>
                  {fallacies.length === 0 && (
                    <p className="text-zinc-500">No precision-gated pattern was emitted.</p>
                  )}
                  {fallacies.map((finding) => (
                    <button
                      key={finding.id}
                      onClick={() => selectFinding(finding)}
                      className="w-full space-y-1 border border-[#333] bg-[#080808] p-2.5 text-left"
                    >
                      <div className="flex justify-between text-[10px] text-amber-300">
                        <span>{finding.fallacy?.possible_type ?? "Possible pattern"}</span>
                        <FindingStateLabel state={finding.state} />
                      </div>
                      <p className="text-xs italic text-white">“{finding.text}”</p>
                      <p className="border-t border-[#1f1f1f] pt-1 text-[10px] text-zinc-400">
                        {finding.fallacy?.why}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {activeLeftTab === "timeline" && (
                <TimelinePanel
                  analysisId={analysisId}
                  findings={findings}
                  segments={transcript?.segments ?? []}
                  onSelect={selectFinding}
                />
              )}
              {activeLeftTab === "speakers" && (
                <div className="space-y-2">
                  {(transcript?.speakers ?? []).map((speaker) => (
                    <div
                      key={speaker.id}
                      className="space-y-2 border border-[#222] bg-[#050505] p-3"
                    >
                      <span className="font-bold text-white">
                        {speaker.display_name ?? speaker.label}
                      </span>
                      <div className="text-[10px] text-zinc-500">
                        {
                          (transcript?.segments ?? []).filter(
                            (segment) => segment.speaker_id === speaker.id,
                          ).length
                        }{" "}
                        SEGMENTS
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col border border-[#262626] bg-[#050505] lg:col-span-5">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-[#262626] bg-[#0c0c0c] px-3">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                <FileText className="h-3.5 w-3.5 text-zinc-500" />
                <span>INTERACTIVE SYNCED TRANSCRIPT</span>
              </div>
              <span className="text-[10px] text-zinc-500">
                {filteredTranscript.length} LINES FOUND
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs">
              {searchQuery.trim() && filteredTranscript.length === 0 && (
                <AnalysisState
                  kind="empty"
                  title="No transcript lines match"
                  description="Clear or revise the transcript and speaker search to restore the full transcript."
                />
              )}
              {filteredTranscript.map((line) => {
                const lineFindings = findings.filter((finding) =>
                  finding.span_refs.some((span) => span.segment_id === line.id),
                )
                const selected = selectedSegmentId === line.id
                return (
                  <button
                    type="button"
                    key={line.id}
                    onClick={() => setSelectedSegmentId(line.id)}
                    className={`w-full border p-3 text-left transition-all ${
                      selected
                        ? "border-white bg-[#141414] text-white shadow-md"
                        : "border-[#1a1a1a] bg-black text-zinc-300 hover:border-[#333]"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          {line.speaker_label ?? "UNATTRIBUTED"}
                        </span>
                        {lineFindings.some((finding) => finding.kind === "claim") && (
                          <AsciiBadge variant="success">CLAIM</AsciiBadge>
                        )}
                        {lineFindings.some((finding) => finding.kind === "fallacy") && (
                          <AsciiBadge variant="warning">POSSIBLE PATTERN</AsciiBadge>
                        )}
                        {line.low_confidence && <AsciiBadge variant="warning">LOW ASR</AsciiBadge>}
                      </div>
                      <span>{timeLabel(line.start_ms)}</span>
                    </div>
                    <p
                      className={`leading-relaxed ${selected ? "font-bold text-white" : "text-zinc-300"}`}
                    >
                      {line.text}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-col border border-[#262626] bg-black lg:col-span-4">
            <div
              role="tablist"
              aria-label="Finding detail views"
              className="flex h-10 shrink-0 items-center gap-1 border-b border-[#262626] bg-[#0c0c0c] px-2"
            >
              {RIGHT_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  id={`workspace-right-tab-${tab}`}
                  role="tab"
                  aria-selected={activeRightTab === tab}
                  aria-controls={`workspace-right-panel-${tab}`}
                  tabIndex={activeRightTab === tab ? 0 : -1}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                    const index = RIGHT_TABS.indexOf(tab)
                    const offset = event.key === "ArrowRight" ? 1 : -1
                    const next =
                      RIGHT_TABS[(index + offset + RIGHT_TABS.length) % RIGHT_TABS.length]
                    setActiveRightTab(next)
                    document.getElementById(`workspace-right-tab-${next}`)?.focus()
                  }}
                  onClick={() => setActiveRightTab(tab)}
                  className={`border px-3 py-1 text-[10px] uppercase transition-colors ${activeRightTab === tab ? "border-white bg-white font-bold text-black" : "border-transparent bg-transparent text-zinc-400 hover:text-white"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div
              id={`workspace-right-panel-${activeRightTab}`}
              role="tabpanel"
              aria-labelledby={`workspace-right-tab-${activeRightTab}`}
              className="flex-1 space-y-4 overflow-y-auto p-4"
            >
              {activeRightTab === "evidence" && selectedFinding && (
                <div className="space-y-4">
                  <div className="space-y-2 border border-[#333] bg-[#0a0a0a] p-3">
                    <div className="text-[10px] font-bold uppercase text-zinc-500">
                      INSPECTED FINDING
                    </div>
                    <p className="text-xs font-bold leading-snug text-white">
                      “{selectedFinding.text}”
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1f1f1f] pt-2">
                      <FindingStateLabel state={selectedFinding.state} />
                      <CategoricalConfidenceBadge band={selectedFinding.confidence_band} />
                    </div>
                  </div>
                  <EvidenceDrawer sources={selectedSources} />
                  <ContestControl
                    findingId={selectedFinding.id}
                    contested={selectedFinding.state === "contested"}
                    onRecorded={markContested}
                  />
                </div>
              )}
              {activeRightTab === "sources" && <EvidenceDrawer sources={analysis?.sources ?? []} />}
              {activeRightTab === "notes" && analysisId && selectedFinding && (
                <AnnotationControls
                  analysisId={analysisId}
                  findingId={selectedFinding.id}
                  annotation={selectedAnnotation}
                  onChanged={updateAnnotationState}
                />
              )}
              {activeRightTab === "notes" && !selectedFinding && (
                <p className="border border-[#222] p-3 text-zinc-500">
                  Select a traceable finding to add a note or curation state.
                </p>
              )}
            </div>
          </div>
        </div>

        {showClaimModal && selectedFinding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
            <section
              ref={inspectorRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="finding-inspector-title"
              className="max-h-[90vh] w-full max-w-2xl space-y-5 overflow-y-auto border border-[#333] bg-black p-5 shadow-2xl sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-[#262626] pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <AsciiBadge variant="success">FINDING INSPECTOR</AsciiBadge>
                  <span className="truncate text-xs font-bold text-zinc-400">
                    {selectedFinding.id}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close finding inspector"
                  onClick={() => setShowClaimModal(false)}
                  className="flex h-10 w-10 items-center justify-center text-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  ✕
                </button>
              </div>
              <h3
                id="finding-inspector-title"
                className="text-sm font-bold leading-relaxed text-white"
              >
                “{selectedFinding.text}”
              </h3>
              <div className="flex flex-wrap gap-3">
                <FindingStateLabel state={selectedFinding.state} />
                <CategoricalConfidenceBadge band={selectedFinding.confidence_band} />
              </div>
              <div className="space-y-2 border border-[#262626] bg-[#080808] p-4">
                <div className="text-[10px] font-bold uppercase text-zinc-500">TRACEABILITY</div>
                <p className="text-xs text-zinc-300">
                  {selectedFinding.span_refs.length} transcript anchor(s);{" "}
                  {selectedFinding.evidence_refs.length} verified external source attachment(s).
                  Speaker-provided support and external evidence remain separate.
                </p>
              </div>
              <ContestControl
                findingId={selectedFinding.id}
                contested={selectedFinding.state === "contested"}
                onRecorded={markContested}
              />
              <div className="flex justify-end">
                <button
                  onClick={() => setShowClaimModal(false)}
                  className="bg-white px-4 py-2 text-xs font-bold text-black hover:bg-zinc-200"
                >
                  CLOSE INSPECTOR
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  )
}
