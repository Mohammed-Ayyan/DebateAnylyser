"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ExternalLink, Play, Search } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard, AsciiSpinner } from "@/components/ascii-decorations"
import { ArgumentStructureView } from "@/components/analysis/argument-structure-view"
import { AppShell } from "@/components/layout/app-shell"
import type { PublicStructureFinding, SpanRef, StructureEdge } from "@/lib/contracts/analysis"

type ConfidenceBand = "high" | "medium" | "low" | "insufficient"
type Segment = {
  id: string
  index: number
  start_ms: number
  end_ms: number
  text: string
  speaker_id: string | null
  speaker_label: string | null
  asr_confidence: ConfidenceBand
  diarization_confidence: ConfidenceBand
  low_confidence: boolean
}
type TranscriptResponse = {
  transcript: {
    id: string
    source: "asr" | "user_supplied"
    language: string | null
    created_at: string
  }
  speakers: Array<{ id: string; label: string; display_name: string | null }>
  segments: Segment[]
}
type ClaimFinding = {
  id: string
  text: string
  paraphrase: boolean
  span_refs: Array<{ segment_id: string; start_char: number; end_char: number }>
  claim: {
    claim_type: "factual" | "value" | "policy" | "causal"
    check_worthy: boolean
    speaker_id: string | null
    speaker_label: string | null
  }
}
type ClaimsResponse = {
  stage_status: "pending" | "running" | "complete" | "failed" | "skipped"
  findings: ClaimFinding[]
}
type SupportFinding = {
  id: string
  state: "ok" | "insufficient" | "contested"
  confidence_band: ConfidenceBand | null
  support: {
    claim_id: string
    support_level: "present" | "weak" | "absent" | null
    rationale: string
    reason_code: string
    anchor_role: "support_evidence" | "claim_subject"
  }
}
type SupportResponse = {
  stages: {
    S2: ClaimsResponse["stage_status"]
    S3: ClaimsResponse["stage_status"]
    S4: ClaimsResponse["stage_status"]
  }
  findings: SupportFinding[]
}
type StructureResponse = {
  stages: SupportResponse["stages"]
  findings: PublicStructureFinding[]
  structure_edges: StructureEdge[]
}

function formatTime(milliseconds: number, timed: boolean): string {
  if (!timed) return "UNTIMED"
  const totalSeconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export default function TranscriptViewerPage() {
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [data, setData] = useState<TranscriptResponse | null>(null)
  const [claims, setClaims] = useState<ClaimFinding[]>([])
  const [claimStageStatus, setClaimStageStatus] = useState<ClaimsResponse["stage_status"] | null>(
    null,
  )
  const [supports, setSupports] = useState<SupportFinding[]>([])
  const [supportStageStatus, setSupportStageStatus] = useState<
    SupportResponse["stages"]["S3"] | null
  >(null)
  const [structureFindings, setStructureFindings] = useState<PublicStructureFinding[]>([])
  const [structureEdges, setStructureEdges] = useState<StructureEdge[]>([])
  const [structureStageStatus, setStructureStageStatus] = useState<
    StructureResponse["stages"]["S4"] | null
  >(null)
  const [search, setSearch] = useState("")
  const [activeSpeakerFilter, setActiveSpeakerFilter] = useState("ALL")
  const [errorMessage, setErrorMessage] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setErrorMessage("")
    const id = new URL(window.location.href).searchParams.get("analysis")
    if (!id) {
      setErrorMessage("No analysis identifier was provided.")
      return
    }
    setAnalysisId(id)
    void fetch(`/api/v1/analyses/${encodeURIComponent(id)}/transcript`, {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The transcript is not ready or could not be loaded.")
        return (await response.json()) as TranscriptResponse
      })
      .then(setData)
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "The transcript could not be loaded.",
        )
      })
    void fetch(`/api/v1/analyses/${encodeURIComponent(id)}/claims`, {
      credentials: "same-origin",
    })
      .then(async (response) => (response.ok ? ((await response.json()) as ClaimsResponse) : null))
      .then((response) => {
        if (!response) return
        setClaims(response.findings)
        setClaimStageStatus(response.stage_status)
      })
      .catch(() => undefined)
    void fetch(`/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=support`, {
      credentials: "same-origin",
    })
      .then(async (response) => (response.ok ? ((await response.json()) as SupportResponse) : null))
      .then((response) => {
        if (!response) return
        setSupports(response.findings)
        setSupportStageStatus(response.stages.S3)
      })
      .catch(() => undefined)
    void fetch(`/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=structure`, {
      credentials: "same-origin",
    })
      .then(async (response) =>
        response.ok ? ((await response.json()) as StructureResponse) : null,
      )
      .then((response) => {
        if (!response) return
        setStructureFindings(response.findings)
        setStructureEdges(response.structure_edges)
        setStructureStageStatus(response.stages.S4)
      })
      .catch(() => undefined)
  }, [reloadKey])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.segments ?? []).filter((segment) => {
      const matchesSpeaker =
        activeSpeakerFilter === "ALL" || segment.speaker_id === activeSpeakerFilter
      const matchesSearch =
        !query ||
        segment.text.toLowerCase().includes(query) ||
        (segment.speaker_label ?? "unattributed").toLowerCase().includes(query)
      return matchesSpeaker && matchesSearch
    })
  }, [activeSpeakerFilter, data, search])
  const claimsBySegment = useMemo(() => {
    const grouped = new Map<string, ClaimFinding[]>()
    for (const claim of claims) {
      for (const span of claim.span_refs) {
        grouped.set(span.segment_id, [...(grouped.get(span.segment_id) ?? []), claim])
      }
    }
    return grouped
  }, [claims])
  const supportByClaim = useMemo(
    () => new Map(supports.map((finding) => [finding.support.claim_id, finding])),
    [supports],
  )
  const timed = data?.transcript.source === "asr"
  const duration = Math.max(0, ...(data?.segments.map((segment) => segment.end_ms) ?? [0]))
  const lowConfidenceCount = data?.segments.filter((segment) => segment.low_confidence).length ?? 0
  const navigateToSpan = (span: SpanRef) => {
    document.getElementById(`segment-${span.segment_id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    })
  }

  return (
    <AppShell>
      <div className="space-y-6 font-mono text-xs">
        <div className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [TRANSCRIPT REVIEW]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Synchronized Transcript Reader
            </h1>
          </div>
          <AsciiBadge variant={lowConfidenceCount > 0 ? "warning" : "default"}>
            {data ? `${formatTime(duration, Boolean(timed))} TOTAL` : "LOADING"}
          </AsciiBadge>
        </div>

        {errorMessage && (
          <AnalysisState
            kind="error"
            title="Transcript unavailable"
            description={errorMessage}
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
        {!data && !errorMessage && (
          <div
            role="status"
            className="flex items-center gap-2 border border-[#262626] bg-black p-4 text-zinc-400"
          >
            <AsciiSpinner /> Loading transcript…
          </div>
        )}

        {data && (
          <>
            <div className="flex flex-col items-center justify-between gap-4 border border-[#333] bg-[#0c0c0c] p-4 md:flex-row">
              <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
                <button
                  type="button"
                  disabled
                  aria-label="Media playback is not available in this milestone"
                  className="flex h-10 w-10 cursor-not-allowed items-center justify-center bg-zinc-700 text-black"
                >
                  <Play className="h-5 w-5 fill-black" />
                </button>
                <div>
                  <div className="text-xs font-bold text-white">
                    {data.transcript.source === "asr"
                      ? "TIMED ASR TRANSCRIPT"
                      : "USER-SUPPLIED TEXT"}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    LANGUAGE: {data.transcript.language?.toUpperCase() ?? "UNSPECIFIED"}
                  </div>
                </div>
              </div>

              <label className="flex w-full max-w-xl items-center gap-2 border border-[#262626] bg-black px-3 py-2">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <span className="sr-only">Search transcript</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search transcript or speaker…"
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-600"
                />
              </label>

              <div className="flex max-w-full items-center gap-1 overflow-x-auto text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveSpeakerFilter("ALL")}
                  className={`border px-2.5 py-1 uppercase ${
                    activeSpeakerFilter === "ALL"
                      ? "border-white bg-white font-bold text-black"
                      : "border-[#333] bg-black text-zinc-400 hover:text-white"
                  }`}
                >
                  ALL
                </button>
                {data.speakers.map((speaker) => (
                  <button
                    type="button"
                    key={speaker.id}
                    onClick={() => setActiveSpeakerFilter(speaker.id)}
                    className={`whitespace-nowrap border px-2.5 py-1 uppercase ${
                      activeSpeakerFilter === speaker.id
                        ? "border-white bg-white font-bold text-black"
                        : "border-[#333] bg-black text-zinc-400 hover:text-white"
                    }`}
                  >
                    {speaker.display_name ?? speaker.label}
                  </button>
                ))}
              </div>
            </div>

            {lowConfidenceCount > 0 && (
              <div
                role="status"
                className="border border-amber-800/60 bg-amber-950/20 p-3 text-amber-200"
              >
                {lowConfidenceCount} segment(s) have low transcription or speaker-attribution
                confidence. Review these spans before relying on downstream analysis.
              </div>
            )}

            {claimStageStatus && (
              <div role="status" className="border border-[#262626] bg-[#080808] p-3 text-zinc-300">
                {claimStageStatus === "complete"
                  ? `${claims.length} transcript-grounded claim(s) extracted. These are source statements, not truth verdicts.`
                  : claimStageStatus === "failed"
                    ? "Claim extraction failed without publishing ungrounded output."
                    : "Claim extraction is still running; this view will show the latest persisted result after refresh."}
              </div>
            )}

            {supportStageStatus && supportStageStatus !== "pending" && (
              <div role="status" className="border border-[#262626] bg-[#080808] p-3 text-zinc-300">
                {supportStageStatus === "complete"
                  ? `${supports.length} speaker-support assessment(s) available. They consider only support provided by the claim speaker in this transcript.`
                  : supportStageStatus === "failed"
                    ? "Speaker support could not be assessed reliably; extracted claims remain available."
                    : "Speaker-provided support assessment is still running; refresh for the latest persisted result."}
              </div>
            )}

            {structureStageStatus && structureStageStatus !== "pending" && (
              <div role="status" className="border border-[#262626] bg-[#080808] p-3 text-zinc-300">
                {structureStageStatus === "complete"
                  ? `${structureFindings.length} traceable argument-structure node(s) available. Inferred nodes are marked explicitly and are not statements attributed to the speaker.`
                  : structureStageStatus === "failed"
                    ? "Argument structure could not be mapped reliably; earlier findings remain available."
                    : "Possible argument structure is still being mapped; refresh for the latest persisted result."}
              </div>
            )}

            {structureStageStatus === "complete" && (
              <ArgumentStructureView
                findings={structureFindings}
                edges={structureEdges}
                onNavigateToSpan={navigateToSpan}
              />
            )}

            <AsciiCard
              title="TIMESTAMPED DEBATE TRANSCRIPT"
              badgeText={`${filtered.length} SEGMENTS`}
            >
              <div className="max-h-[500px] space-y-4 overflow-y-auto pr-2">
                {filtered.length === 0 && (
                  <p className="border border-[#1a1a1a] p-3 text-zinc-500">
                    No transcript segments match this filter.
                  </p>
                )}
                {filtered.map((segment) => (
                  <div
                    id={`segment-${segment.id}`}
                    key={segment.id}
                    className={`space-y-1.5 border bg-black p-3 transition-colors ${
                      segment.low_confidence
                        ? "border-amber-900/70"
                        : "border-[#1a1a1a] hover:border-[#333]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold uppercase text-white">
                          {segment.speaker_label ?? "Unattributed"}
                        </span>
                        {segment.low_confidence && (
                          <AsciiBadge variant="warning">REVIEW ATTRIBUTION</AsciiBadge>
                        )}
                        <AsciiBadge variant="outline">
                          ASR {segment.asr_confidence.toUpperCase()}
                        </AsciiBadge>
                        <AsciiBadge variant="outline">
                          SPEAKER {segment.diarization_confidence.toUpperCase()}
                        </AsciiBadge>
                      </div>
                      <span className="font-mono text-zinc-400">
                        {formatTime(segment.start_ms, Boolean(timed))}
                      </span>
                    </div>
                    <p className="font-mono text-xs leading-relaxed text-zinc-300">
                      {segment.text}
                    </p>
                    {(claimsBySegment.get(segment.id) ?? []).map((claim) => {
                      const supportFinding = supportByClaim.get(claim.id)
                      const supportLabel =
                        supportFinding?.support.support_level === "present"
                          ? "PRESENT IN TRANSCRIPT"
                          : supportFinding?.support.support_level === "weak"
                            ? "LIMITED IN TRANSCRIPT"
                            : supportFinding?.support.support_level === "absent"
                              ? "NOT FOUND IN EXAMINED TRANSCRIPT"
                              : "INSUFFICIENT TO ASSESS"
                      return (
                        <div
                          key={claim.id}
                          className="mt-2 border-l-2 border-zinc-600 bg-[#080808] px-3 py-2 text-[10px] text-zinc-300"
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2 uppercase text-zinc-500">
                            <AsciiBadge variant="outline">
                              {claim.claim.claim_type} claim
                            </AsciiBadge>
                            {claim.claim.check_worthy && (
                              <AsciiBadge variant="default">CHECK-WORTHY</AsciiBadge>
                            )}
                            {claim.paraphrase && (
                              <AsciiBadge variant="warning">PARAPHRASE</AsciiBadge>
                            )}
                          </div>
                          <span className="leading-relaxed text-white">{claim.text}</span>
                          {analysisId &&
                            claim.claim.check_worthy &&
                            (claim.claim.claim_type === "factual" ||
                              claim.claim.claim_type === "causal") && (
                              <div className="mt-2">
                                <a
                                  href={`/source-explorer?analysis=${encodeURIComponent(analysisId)}&finding=${encodeURIComponent(claim.id)}`}
                                  className="inline-flex items-center gap-1 border border-[#333] px-2 py-1 font-bold text-zinc-300 hover:border-white hover:text-white"
                                >
                                  VIEW VERIFIED EVIDENCE
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            )}
                          {supportFinding && (
                            <div className="mt-2 border-t border-[#262626] pt-2 text-zinc-400">
                              <div className="mb-1 flex flex-wrap items-center gap-2 uppercase">
                                <AsciiBadge
                                  variant={
                                    supportFinding.state === "insufficient" ? "warning" : "outline"
                                  }
                                >
                                  SUPPORT PROVIDED: {supportLabel}
                                </AsciiBadge>
                              </div>
                              <p className="leading-relaxed">{supportFinding.support.rationale}</p>
                              {supportFinding.support.support_level === "absent" && (
                                <p className="mt-1 text-zinc-500">
                                  This does not mean the claim is false.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </AsciiCard>
            <p className="text-[10px] leading-relaxed text-zinc-500">
              Confidence labels describe provider signals, not factual truth. Extracted claims
              identify statements present in anchored transcript spans; they are not fact checks or
              credibility judgments. Speaker-support labels describe only support supplied by the
              same speaker in this transcript; support not found here does not mean false.
              Argument-structure nodes describe possible Toulmin patterns; inferred nodes are not
              attributed statements and neither map nor list is a quality score. User-supplied text
              has no model-generated transcription or speaker confidence. Analysis ID: {analysisId}
            </p>
          </>
        )}
      </div>
    </AppShell>
  )
}
