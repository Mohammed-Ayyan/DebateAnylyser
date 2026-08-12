"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ArrowRight, Check, Terminal as TerminalIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard, AsciiProgress, AsciiSpinner } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

type StageStatus = "pending" | "running" | "complete" | "failed" | "skipped"
type PipelineStage = `S${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`

type StageEvent = {
  type: "stage.status"
  stage: PipelineStage
  status: StageStatus
  attempt: number
  error_class?: string
}
type ErrorEventData = { type: "error"; code: string; message: string }

type TranscriptSummary = {
  segments?: Array<{ low_confidence: boolean }>
  transcript?: { source: "asr" | "user_supplied"; language: string | null }
}
type FindingBatchEvent = {
  type: "finding.batch"
  stage: PipelineStage
  findings: Array<{ id: string; evidence_refs?: string[] }>
}
type ClaimSummary = {
  stage_status: StageStatus
  findings: Array<{ id: string }>
}
type FindingsSummary = {
  stages: {
    S2: StageStatus
    S3: StageStatus
    S4: StageStatus
    S5: StageStatus
    S6: StageStatus
    S7: StageStatus
    S8: StageStatus
    S9: StageStatus
    S10: StageStatus
  }
  findings: Array<{ id: string; evidence_refs?: string[] }>
}
type AnalysisSummary = {
  status: "queued" | "transcribing" | "analyzing" | "partial" | "complete" | "failed"
  assembly_ready: boolean
  stage_runs: Array<{ stage: PipelineStage; status: StageStatus }>
  findings: Array<{ id: string; kind: string; evidence_refs?: string[] }>
}

const PIPELINE_STAGES: Array<{ id: PipelineStage; name: string }> = [
  { id: "S0", name: "Submission & Rights Verification" },
  { id: "S1", name: "Transcription & Speaker Diarization" },
  { id: "S2", name: "Claim Extraction" },
  { id: "S3", name: "Speaker Support Assessment" },
  { id: "S4", name: "Argument Structure Mapping" },
  { id: "S5", name: "Possible Fallacy & Rhetoric Analysis" },
  { id: "S6", name: "External Evidence Retrieval" },
  { id: "S7", name: "Source Credibility Signals" },
  { id: "S8", name: "Bounded Synthesis" },
  { id: "S9", name: "Traceability Gate" },
  { id: "S10", name: "Output Assembly" },
]

function parseEvent<T>(event: Event): T | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return undefined
  try {
    return JSON.parse(event.data) as T
  } catch {
    return undefined
  }
}

export default function ProcessingPage() {
  const router = useRouter()
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<PipelineStage, StageStatus>>(
    () =>
      Object.fromEntries(
        PIPELINE_STAGES.map((stage) => [stage.id, stage.id === "S0" ? "complete" : "pending"]),
      ) as Record<PipelineStage, StageStatus>,
  )
  const [logs, setLogs] = useState<string[]>(["[SYSTEM] Waiting for durable worker events…"])
  const [transcriptReady, setTranscriptReady] = useState(false)
  const [summary, setSummary] = useState<TranscriptSummary | null>(null)
  const [claimIds, setClaimIds] = useState<Set<string>>(() => new Set())
  const [supportIds, setSupportIds] = useState<Set<string>>(() => new Set())
  const [structureIds, setStructureIds] = useState<Set<string>>(() => new Set())
  const [fallacyIds, setFallacyIds] = useState<Set<string>>(() => new Set())
  const [evidenceIds, setEvidenceIds] = useState<Set<string>>(() => new Set())
  const [credibilityIds, setCredibilityIds] = useState<Set<string>>(() => new Set())
  const [assemblyReady, setAssemblyReady] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisSummary["status"] | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting" | "offline"
  >("connecting")

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("analysis")
    if (!id) {
      setErrorMessage("No analysis identifier was provided. Start a new analysis and retry.")
      return
    }
    setAnalysisId(id)
    let terminalReached = false
    const reconcileTranscript = async () => {
      const response = await fetch(`/api/v1/analyses/${encodeURIComponent(id)}/transcript`, {
        credentials: "same-origin",
      })
      if (!response.ok) return
      const transcript = (await response.json()) as TranscriptSummary
      setSummary(transcript)
      setTranscriptReady(true)
      setStatuses((current) => ({ ...current, S1: "complete" }))
    }
    const reconcileClaims = async () => {
      const response = await fetch(`/api/v1/analyses/${encodeURIComponent(id)}/claims`, {
        credentials: "same-origin",
      })
      if (!response.ok) return
      const claims = (await response.json()) as ClaimSummary
      setClaimIds(new Set(claims.findings.map((finding) => finding.id)))
      setStatuses((current) => ({ ...current, S2: claims.stage_status }))
    }
    const reconcileSupport = async () => {
      const response = await fetch(
        `/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=support`,
        { credentials: "same-origin" },
      )
      if (!response.ok) return
      const support = (await response.json()) as FindingsSummary
      setSupportIds(new Set(support.findings.map((finding) => finding.id)))
      setStatuses((current) => ({ ...current, S3: support.stages.S3 }))
    }
    const reconcileStructure = async () => {
      const response = await fetch(
        `/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=structure`,
        { credentials: "same-origin" },
      )
      if (!response.ok) return
      const structure = (await response.json()) as FindingsSummary
      setStructureIds(new Set(structure.findings.map((finding) => finding.id)))
      setStatuses((current) => ({ ...current, S4: structure.stages.S4 }))
    }
    const reconcileFallacies = async () => {
      const response = await fetch(
        `/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=fallacy`,
        { credentials: "same-origin" },
      )
      if (!response.ok) return
      const fallacies = (await response.json()) as FindingsSummary
      setFallacyIds(new Set(fallacies.findings.map((finding) => finding.id)))
      setStatuses((current) => ({ ...current, S5: fallacies.stages.S5 }))
    }
    const reconcileEvidence = async () => {
      const response = await fetch(
        `/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=claim`,
        { credentials: "same-origin" },
      )
      if (!response.ok) return
      const evidence = (await response.json()) as FindingsSummary
      setEvidenceIds(new Set(evidence.findings.flatMap((finding) => finding.evidence_refs ?? [])))
      setStatuses((current) => ({ ...current, S6: evidence.stages.S6 }))
    }
    const reconcileCredibility = async () => {
      const response = await fetch(
        `/api/v1/analyses/${encodeURIComponent(id)}/findings?kind=credibility`,
        { credentials: "same-origin" },
      )
      if (!response.ok) return
      const credibility = (await response.json()) as FindingsSummary
      setCredibilityIds(new Set(credibility.findings.map((finding) => finding.id)))
      setStatuses((current) => ({ ...current, S7: credibility.stages.S7 }))
    }
    const reconcileAssembly = async () => {
      const response = await fetch(`/api/v1/analyses/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      })
      if (!response.ok) return
      const assembled = (await response.json()) as AnalysisSummary
      setAssemblyReady(assembled.assembly_ready)
      setAnalysisStatus(assembled.status)
      if (["complete", "partial", "failed"].includes(assembled.status)) {
        terminalReached = true
        stream.close()
        setConnection("connected")
      }
      setStatuses((current) => {
        const next = { ...current }
        assembled.stage_runs.forEach((run) => {
          next[run.stage] = run.status
        })
        return next
      })
    }
    const reconcile = (...tasks: Array<() => Promise<void>>) => {
      void Promise.allSettled(tasks.map((task) => task())).then((results) => {
        if (results.every((result) => result.status === "rejected")) {
          setErrorMessage(
            "Persisted processing state could not be reconciled. Live updates will retry automatically.",
          )
        }
      })
    }
    reconcile(
      reconcileTranscript,
      reconcileClaims,
      reconcileSupport,
      reconcileStructure,
      reconcileFallacies,
      reconcileEvidence,
      reconcileCredibility,
      reconcileAssembly,
    )
    const stream = new EventSource(`/api/v1/analyses/${encodeURIComponent(id)}/stream`)
    const handleOnline = () => setConnection("reconnecting")
    const handleOffline = () => setConnection("offline")
    setConnection(navigator.onLine ? "connecting" : "offline")
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    stream.onopen = () => setConnection("connected")
    stream.onerror = () => {
      if (!terminalReached) setConnection(navigator.onLine ? "reconnecting" : "offline")
    }

    const onStage = (event: Event) => {
      const data = parseEvent<StageEvent>(event)
      if (!data || data.type !== "stage.status") return
      setStatuses((current) => ({ ...current, [data.stage]: data.status }))
      setLogs((current) => [
        ...current.slice(-49),
        `[${data.stage}] ${data.status.toUpperCase()} — attempt ${data.attempt}`,
      ])
    }
    const onTranscript = (event: Event) => {
      const data = parseEvent<{ type: "transcript.ready"; transcript_id: string }>(event)
      if (!data || data.type !== "transcript.ready") return
      setTranscriptReady(true)
      setStatuses((current) => ({ ...current, S1: "complete" }))
      setLogs((current) => [
        ...current.slice(-49),
        "[S1] Transcript persisted and ready for review.",
      ])
      reconcile(reconcileTranscript)
    }
    const onFindingBatch = (event: Event) => {
      const data = parseEvent<FindingBatchEvent>(event)
      if (!data || data.type !== "finding.batch") return
      if (data.stage === "S2") {
        setClaimIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) => next.add(finding.id))
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S2] ${data.findings.length} traceable claim(s) persisted.`,
        ])
      }
      if (data.stage === "S3") {
        setSupportIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) => next.add(finding.id))
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S3] ${data.findings.length} speaker-support assessment(s) persisted.`,
        ])
      }
      if (data.stage === "S4") {
        setStructureIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) => next.add(finding.id))
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S4] ${data.findings.length} traceable structure node(s) persisted.`,
        ])
      }
      if (data.stage === "S5") {
        setFallacyIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) => next.add(finding.id))
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S5] ${data.findings.length} precision-gated possible pattern(s) persisted.`,
        ])
      }
      if (data.stage === "S6") {
        setEvidenceIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) =>
            finding.evidence_refs?.forEach((sourceId) => next.add(sourceId)),
          )
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S6] ${data.findings.length} claim(s) received verified evidence attachments.`,
        ])
      }
      if (data.stage === "S7") {
        setCredibilityIds((current) => {
          const next = new Set(current)
          data.findings.forEach((finding) => next.add(finding.id))
          return next
        })
        setLogs((current) => [
          ...current.slice(-49),
          `[S7] ${data.findings.length} source(s) received categorical rater signals.`,
        ])
      }
    }
    const onDone = (event: Event) => {
      const data = parseEvent<{ type: "analysis.done"; status: "partial" | "complete" | "failed" }>(
        event,
      )
      if (!data || data.type !== "analysis.done") return
      terminalReached = true
      stream.close()
      setConnection("connected")
      setLogs((current) => [
        ...current.slice(-49),
        data.status === "complete"
          ? "[ANALYSIS] COMPLETE — traceability assembly is ready."
          : data.status === "partial"
            ? "[ANALYSIS] PARTIAL — completed stages are preserved; unavailable stages are disclosed."
            : "[ANALYSIS] FAILED — persisted progress is preserved for review or retry.",
      ])
      reconcile(
        reconcileSupport,
        reconcileStructure,
        reconcileFallacies,
        reconcileEvidence,
        reconcileCredibility,
        reconcileAssembly,
      )
    }
    const onError = (event: Event) => {
      const data = parseEvent<ErrorEventData>(event)
      if (!data || data.type !== "error") return
      setErrorMessage(data.message)
      setLogs((current) => [...current.slice(-49), `[NOTICE] ${data.message}`])
    }
    stream.addEventListener("stage.status", onStage)
    stream.addEventListener("transcript.ready", onTranscript)
    stream.addEventListener("finding.batch", onFindingBatch)
    stream.addEventListener("analysis.done", onDone)
    stream.addEventListener("error", onError)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      stream.close()
    }
  }, [])

  const resolvedCount = useMemo(
    () =>
      Object.values(statuses).filter((status) => status === "complete" || status === "skipped")
        .length,
    [statuses],
  )
  const skippedCount = useMemo(
    () => Object.values(statuses).filter((status) => status === "skipped").length,
    [statuses],
  )
  const progressPercent = Math.round((resolvedCount / PIPELINE_STAGES.length) * 100)
  const lowConfidenceCount =
    summary?.segments?.filter((segment) => segment.low_confidence).length ?? 0
  const claimCount = claimIds.size
  const supportCount = supportIds.size
  const structureCount = structureIds.size
  const fallacyCount = fallacyIds.size
  const evidenceCount = evidenceIds.size
  const credibilityCount = credibilityIds.size
  const claimsComplete = statuses.S2 === "complete"
  const supportStarted = statuses.S3 !== "pending"
  const structureStarted = statuses.S4 !== "pending"
  const fallacyStarted = statuses.S5 !== "pending"
  const evidenceStarted = statuses.S6 !== "pending"
  const credibilityStarted = statuses.S7 !== "pending"
  const latestStartedStage = credibilityStarted
    ? "S7"
    : evidenceStarted
      ? "S6"
      : fallacyStarted
        ? "S5"
        : structureStarted
          ? "S4"
          : supportStarted
            ? "S3"
            : "S2"
  const latestStatus = statuses[latestStartedStage]
  const milestoneReady = ["complete", "failed", "skipped"].includes(latestStatus)
  const currentStage =
    PIPELINE_STAGES.find((stage) => statuses[stage.id] === "running")?.id ??
    PIPELINE_STAGES.find((stage) => statuses[stage.id] === "pending")?.id ??
    "S10"
  const analysisTerminal =
    analysisStatus !== null && ["complete", "partial", "failed"].includes(analysisStatus)

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 font-mono">
        <div className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {!milestoneReady && !errorMessage && <AsciiSpinner />}
              <span>[DURABLE PIPELINE WORKER]</span>
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              {assemblyReady
                ? "Analysis Workspace Ready"
                : statuses.S7 === "complete"
                  ? "Categorical Source Signals Ready"
                  : statuses.S7 === "running"
                    ? "Loading Provenanced Source Signals"
                    : statuses.S6 === "complete"
                      ? "Verified Evidence Retrieval Complete"
                      : statuses.S6 === "running"
                        ? "Resolving and Verifying External Evidence"
                        : statuses.S5 === "complete"
                          ? "Possible Fallacy & Rhetoric Analysis Ready"
                          : statuses.S5 === "running"
                            ? "Checking for High-Precision Possible Patterns"
                            : statuses.S4 === "complete"
                              ? "Traceable Argument Structure Ready"
                              : statuses.S4 === "running"
                                ? "Mapping Possible Toulmin Structure"
                                : statuses.S3 === "complete"
                                  ? "Claims & Speaker-Provided Support Ready"
                                  : statuses.S3 === "running"
                                    ? "Assessing Support Provided in This Transcript"
                                    : claimsComplete
                                      ? "Traceable Claims Ready for Review"
                                      : transcriptReady
                                        ? "Extracting Transcript-Grounded Claims"
                                        : "Processing Debate Source"}
            </h1>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-white">{progressPercent}%</span>
            <div className="text-[10px] text-zinc-500">
              {statuses.S7 === "complete"
                ? "M7 PARTIAL RESULT — LATER STAGES PENDING"
                : statuses.S6 === "complete" && !credibilityStarted
                  ? "F6 PARTIAL RESULT — LATER STAGES PENDING"
                  : statuses.S5 === "complete" && !evidenceStarted
                    ? "F17 PARTIAL RESULT — LATER STAGES PENDING"
                    : statuses.S4 === "complete" && !fallacyStarted
                      ? "F5 PARTIAL RESULT — LATER STAGES PENDING"
                      : statuses.S3 === "complete" && !structureStarted
                        ? "F4 PARTIAL RESULT — LATER STAGES PENDING"
                        : claimsComplete && !supportStarted && !evidenceStarted
                          ? "S2 COMPLETE — LATER STAGES PENDING"
                          : `${currentStage} ACTIVE`}
            </div>
          </div>
        </div>

        <div className="space-y-2 border border-[#262626] bg-black p-4">
          <div className="flex justify-between text-xs text-zinc-400">
            <span>PIPELINE PROGRESS</span>
            <span>
              {resolvedCount} / {PIPELINE_STAGES.length} STAGES RESOLVED
              {skippedCount > 0 ? ` — ${skippedCount} SKIPPED` : ""}
            </span>
          </div>
          <AsciiProgress value={progressPercent} length={36} showPercentage={false} />
        </div>

        {connection !== "connected" && analysisId && !analysisTerminal && (
          <AnalysisState
            kind={connection === "offline" ? "unavailable" : "loading"}
            title={
              connection === "offline" ? "You are offline" : "Reconnecting to processing updates"
            }
            description={
              connection === "offline"
                ? "Persisted progress remains visible, but new worker events cannot arrive until the network connection returns."
                : "The live status stream is temporarily unavailable. Server-authoritative progress will resume automatically when the connection recovers."
            }
          />
        )}

        {statuses.S2 === "skipped" && (
          <AnalysisState
            kind="unavailable"
            title="Analysis providers not configured — transcript preserved"
            description="Claim extraction and dependent stages (S2–S7) are disabled because provider credentials are not set. The transcript is intact and assembly is running without fabricated findings. Configure OPENAI_API_KEY and DEEPGRAM_API_KEY then restart the worker to enable provider-backed analysis."
          />
        )}

        {statuses.S6 === "skipped" && statuses.S2 !== "skipped" && (
          <AnalysisState
            kind="unavailable"
            title="External evidence retrieval not available"
            description="S6 evidence retrieval requires a configured evidence-retriever service. This stage was skipped safely; claims and speaker-support findings from S2–S5 are preserved without external verification."
          />
        )}

        {statuses.S7 === "skipped" && statuses.S2 !== "skipped" && (
          <AnalysisState
            kind="unavailable"
            title="Source credibility signals not available"
            description="S7 source credibility requires a reviewed rater service. This stage was skipped safely; verified evidence from S6 (if any) is preserved without credibility category assignment."
          />
        )}

        {!assemblyReady && statuses.S2 === "complete" && (
          <AnalysisState
            kind="unavailable"
            title="Detailed findings await traceability assembly"
            description="Completed stage status is visible now, but finding counts may remain zero until S9 validates anchors and S10 assembles the owner workspace. No intermediate model output is presented as a final finding."
          />
        )}

        {errorMessage && (
          <div
            role="alert"
            className="border border-red-900 bg-red-950/30 p-3 text-xs text-red-300"
          >
            {errorMessage}
          </div>
        )}
        {transcriptReady && summary && (
          <div
            role="status"
            className={`border p-3 text-xs ${
              lowConfidenceCount > 0
                ? "border-amber-800/60 bg-amber-950/20 text-amber-200"
                : "border-emerald-800/60 bg-emerald-950/20 text-emerald-200"
            }`}
          >
            {statuses.S7 === "complete"
              ? credibilityCount > 0
                ? `${credibilityCount} verified source(s) have categorical, method-provenanced rater signals. These signals remain contested and are not scores or truth verdicts.`
                : "Source credibility assessment completed without approved rater data. No category was invented."
              : statuses.S7 === "failed"
                ? "Source credibility signals were unavailable. Verified evidence remains preserved and unranked."
                : statuses.S6 === "complete"
                  ? evidenceCount > 0
                    ? `${evidenceCount} exact source quote(s) passed resolution and claim-relation verification. Relations apply only to specific claim/source pairs and are not overall truth or credibility verdicts.${lowConfidenceCount > 0 ? ` ${lowConfidenceCount} source segment(s) still carry transcription or attribution caveats.` : ""}`
                    : "External evidence retrieval completed, but no candidate passed the resolution and exact-quote gate. This is not a true/false judgment."
                  : statuses.S6 === "failed"
                    ? "External evidence could not be verified reliably. Earlier transcript-grounded findings remain available without an external truth verdict."
                    : statuses.S5 === "complete"
                      ? `${fallacyCount} precision-gated possible pattern(s) are available. Empty results are valid; these labels are contestable and never person verdicts.${lowConfidenceCount > 0 ? ` ${lowConfidenceCount} source segment(s) still carry transcription or attribution caveats.` : ""}`
                      : statuses.S5 === "failed"
                        ? "Possible fallacy and rhetoric patterns could not be identified reliably. Earlier transcript-grounded findings remain available."
                        : statuses.S4 === "complete"
                          ? `${structureCount} traceable Toulmin node(s) are available. Inferred nodes are explicitly marked and describe only a possible argument pattern—not truth, quality, or speaker credibility.${lowConfidenceCount > 0 ? ` ${lowConfidenceCount} source segment(s) still carry transcription or attribution caveats.` : ""}`
                          : statuses.S4 === "failed"
                            ? `Argument structure could not be mapped reliably. ${claimCount} claim(s) and ${supportCount} speaker-support assessment(s) remain available.`
                            : statuses.S3 === "complete"
                              ? `${supportCount} speaker-support assessment(s) are available for ${claimCount} claim(s). These describe only support supplied by the same speaker in this transcript; absent support does not mean a claim is false.${lowConfidenceCount > 0 ? ` ${lowConfidenceCount} source segment(s) still carry transcription or attribution caveats.` : ""}`
                              : statuses.S3 === "failed"
                                ? `Speaker support could not be assessed reliably. ${claimCount} transcript-grounded claim(s) remain available without a truth verdict.`
                                : claimsComplete
                                  ? `${claimCount} transcript-grounded claim(s) were extracted. No truth verdict, evidence judgment, or credibility score has been assigned.${lowConfidenceCount > 0 ? ` ${lowConfidenceCount} source segment(s) still carry transcription or attribution caveats.` : ""}`
                                  : summary.transcript?.source === "user_supplied"
                                    ? "User-supplied text was preserved without invented timing or model confidence."
                                    : lowConfidenceCount > 0
                                      ? `${lowConfidenceCount} segment(s) need review because transcription or speaker attribution confidence was low.`
                                      : "No low-confidence transcript segments were reported by the transcription stage."}
          </div>
        )}

        <AsciiCard title="PIPELINE STAGE MATRIX" badgeText="SERVER-AUTHORITATIVE">
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const status = statuses[stage.id]
              const isCurrent = status === "running"
              return (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between border p-2.5 transition-all ${
                    status === "complete"
                      ? "border-[#222] bg-[#0a0a0a] text-zinc-300"
                      : status === "skipped"
                        ? "border-amber-950 bg-amber-950/10 text-amber-300"
                        : status === "failed"
                          ? "border-red-900 bg-red-950/20 text-red-300"
                          : isCurrent
                            ? "border-white bg-[#141414] font-bold text-white"
                            : "border-[#1a1a1a] bg-black text-zinc-600"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-[10px] text-zinc-500">
                      [{String(index + 1).padStart(2, "0")}]
                    </span>
                    <span className="truncate">{stage.name}</span>
                  </div>
                  {status === "complete" && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  )}
                  {isCurrent && <AsciiSpinner className="text-white" />}
                  {status === "skipped" && <AsciiBadge variant="outline">SKIPPED</AsciiBadge>}
                  {status === "failed" && <AsciiBadge variant="destructive">FAILED</AsciiBadge>}
                </div>
              )
            })}
          </div>
        </AsciiCard>

        <div className="overflow-hidden border border-[#262626] bg-[#050505]">
          <div className="flex h-8 items-center justify-between border-b border-[#262626] bg-[#0c0c0c] px-3 text-[10px] text-zinc-400">
            <div className="flex items-center gap-2">
              <TerminalIcon className="h-3.5 w-3.5 text-zinc-500" />
              <span>ACCESSIBLE WORKER STATUS STREAM</span>
            </div>
            <span>{analysisId ? connection.toUpperCase() : "NO ANALYSIS"}</span>
          </div>
          <div
            aria-live="polite"
            className="max-h-40 space-y-1 overflow-y-auto p-3 text-[11px] text-zinc-400"
          >
            {logs.map((log, index) => (
              <div key={`${index}-${log}`} className="leading-snug">
                {log}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2">
          {analysisId && assemblyReady ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => router.push(`/workspace?analysis=${encodeURIComponent(analysisId)}`)}
                className="flex min-h-12 items-center justify-center gap-2 border border-white bg-white px-4 text-sm font-extrabold uppercase tracking-wider text-black hover:bg-zinc-200"
              >
                OPEN ASSEMBLED WORKSPACE <ArrowRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => router.push(`/reports?analysis=${encodeURIComponent(analysisId)}`)}
                className="flex min-h-12 items-center justify-center gap-2 border border-white px-4 text-sm font-bold uppercase text-white hover:bg-white hover:text-black"
              >
                OPEN REPORT
              </button>
            </div>
          ) : transcriptReady && analysisId ? (
            <button
              type="button"
              onClick={() =>
                router.push(`/transcript-viewer?analysis=${encodeURIComponent(analysisId)}`)
              }
              className="flex w-full items-center justify-center gap-2 border border-white bg-white py-4 text-sm font-extrabold uppercase tracking-wider text-black shadow-lg transition-colors hover:bg-zinc-200"
            >
              <span>
                {analysisStatus === "failed"
                  ? "REVIEW PRESERVED TRANSCRIPT & PARTIAL RESULTS"
                  : statuses.S7 === "complete"
                    ? "REVIEW VERIFIED EVIDENCE & CATEGORICAL SOURCE SIGNALS"
                    : statuses.S6 === "complete"
                      ? "REVIEW CLAIMS & VERIFIED EVIDENCE"
                      : statuses.S5 === "complete"
                        ? "REVIEW TRANSCRIPT & POSSIBLE PATTERNS"
                        : statuses.S4 === "complete"
                          ? "REVIEW TRANSCRIPT & ARGUMENT STRUCTURE DATA"
                          : statuses.S3 === "complete"
                            ? "REVIEW TRANSCRIPT, CLAIMS & SPEAKER SUPPORT"
                            : claimsComplete
                              ? "REVIEW TRANSCRIPT & EXTRACTED CLAIMS"
                              : "REVIEW TRANSCRIPT"}
              </span>
              <ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <div className="py-2 text-center text-xs text-zinc-500">
              [!] Transcription runs asynchronously. This page reconnects automatically.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
