"use client"

import Link from "next/link"
import React, { useEffect, useRef, useState } from "react"
import { Download, Printer, Share2, Trash2 } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { CoverageOverview } from "@/components/analysis/coverage-overview"
import { CategoricalConfidenceBadge } from "@/components/analysis/categorical-confidence-badge"
import { FindingStateLabel } from "@/components/analysis/finding-state-label"
import { AsciiDivider } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import { annotationListSchema, type Annotation } from "@/lib/annotations/contracts"
import type { PublicAnalysisResource } from "@/lib/contracts/analysis"

type ReportExport = {
  id: string
  status: "queued" | "processing" | "complete" | "failed" | "revoked"
  download_url?: string
}
type Share = { id: string; status: "active" | "revoked"; created_at: string }

export default function ReportsPage() {
  const [analysis, setAnalysis] = useState<PublicAnalysisResource | null>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [shares, setShares] = useState<Share[]>([])
  const [shareUrl, setShareUrl] = useState("")
  const [exportState, setExportState] = useState<ReportExport | null>(null)
  const [working, setWorking] = useState(false)
  const [sharing, setSharing] = useState(false)
  const exportTimer = useRef<number | null>(null)
  const [analysisId, setAnalysisId] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    const id = new URL(window.location.href).searchParams.get("analysis")
    if (!id) {
      setError("")
      setLoading(false)
      return
    }
    setAnalysisId(id)
    const basePath = `/api/v1/analyses/${encodeURIComponent(id)}`
    void Promise.all([
      fetch(basePath, { credentials: "same-origin" }),
      fetch(`${basePath}/annotations`, { credentials: "same-origin" }),
      fetch(`${basePath}/shares`, { credentials: "same-origin" }),
    ])
      .then(async ([analysisResponse, annotationResponse, shareResponse]) => {
        if (!analysisResponse.ok) throw new Error("The assembled report is unavailable.")
        if (!annotationResponse.ok) throw new Error("Report curation is unavailable.")
        setAnalysis((await analysisResponse.json()) as PublicAnalysisResource)
        setAnnotations(annotationListSchema.parse(await annotationResponse.json()).annotations)
        if (shareResponse.ok) {
          setShares(((await shareResponse.json()) as { shares: Share[] }).shares)
        }
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "Report loading failed."),
      )
      .finally(() => setLoading(false))
  }, [reloadKey])

  useEffect(
    () => () => {
      if (exportTimer.current !== null) window.clearTimeout(exportTimer.current)
    },
    [],
  )

  const pollExport = async (exportId: string) => {
    const response = await fetch(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}/exports/${encodeURIComponent(exportId)}`,
      { credentials: "same-origin", cache: "no-store" },
    )
    if (!response.ok) throw new Error("Report export status is unavailable.")
    const next = (await response.json()) as ReportExport
    setExportState(next)
    if (next.status === "complete" && next.download_url) {
      setWorking(false)
      window.location.assign(next.download_url)
    } else if (next.status === "queued" || next.status === "processing") {
      exportTimer.current = window.setTimeout(
        () => void pollExport(exportId).catch(showFailure),
        1_500,
      )
    } else {
      setWorking(false)
    }
  }
  const showFailure = (cause: unknown) => {
    setWorking(false)
    setError(cause instanceof Error ? cause.message : "Operation failed.")
  }
  const createExport = async () => {
    setWorking(true)
    setError("")
    const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/exports`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", origin: window.location.origin },
      body: JSON.stringify({ format: "html" }),
    })
    if (!response.ok) throw new Error("HTML report export is unavailable.")
    const created = (await response.json()) as ReportExport
    setExportState(created)
    await pollExport(created.id)
  }
  const createPublicShare = async () => {
    if (sharing) return
    setSharing(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/shares`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error("Public sharing is unavailable.")
      const created = (await response.json()) as { share: Share; token: string }
      setShares((current) => [created.share, ...current])
      setShareUrl(`${window.location.origin}/shared/${created.token}`)
    } finally {
      setSharing(false)
    }
  }
  const revokePublicShare = async (shareId: string) => {
    const response = await fetch(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}/shares/${encodeURIComponent(shareId)}`,
      { method: "DELETE", credentials: "same-origin", headers: { origin: window.location.origin } },
    )
    if (!response.ok) throw new Error("Share revocation failed.")
    setShares((current) =>
      current.map((share) => (share.id === shareId ? { ...share, status: "revoked" } : share)),
    )
    setShareUrl("")
  }

  const hiddenIds = new Set(
    annotations
      .filter((annotation) => annotation.visibility === "hidden" && annotation.finding_id)
      .map((annotation) => annotation.finding_id),
  )
  const highlightedIds = new Set(
    annotations
      .filter((annotation) => annotation.highlighted && annotation.finding_id)
      .map((annotation) => annotation.finding_id),
  )
  const curatedFindings = (analysis?.findings ?? [])
    .filter((finding) => !hiddenIds.has(finding.id))
    .sort(
      (left, right) => Number(highlightedIds.has(right.id)) - Number(highlightedIds.has(left.id)),
    )
  const claims = curatedFindings.filter((finding) => finding.kind === "claim")
  const fallacies = curatedFindings.filter((finding) => finding.kind === "fallacy")
  const sourceAttachments = new Set(claims.flatMap((finding) => finding.evidence_refs)).size
  const curationApplied = annotations.length > 0

  return (
    <AppShell>
      <div className="space-y-6 font-mono text-xs">
        <div className="flex flex-col justify-between gap-4 border border-[#262626] bg-[#080808] p-4 md:flex-row md:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [READ-ONLY ANALYSIS REPORT]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Evidence-Aware Discourse Analysis
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex min-h-10 items-center gap-1.5 border border-[#333] bg-[#141414] px-3 text-zinc-300 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>PRINT VIEW</span>
            </button>
            <button
              disabled={!analysis?.assembly_ready || working}
              onClick={() => void createExport().catch(showFailure)}
              className="flex min-h-10 items-center gap-1.5 border border-white bg-white px-4 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{working ? "GENERATING HTML…" : "DOWNLOAD HTML"}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="Opens your browser's print dialog. Choose Save as PDF."
              className="flex min-h-10 items-center gap-1.5 border border-[#333] bg-[#141414] px-3 text-zinc-300 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>PRINT / SAVE AS PDF</span>
            </button>
            <button
              type="button"
              disabled={!analysis?.assembly_ready || sharing}
              onClick={() => void createPublicShare().catch(showFailure)}
              className="flex min-h-10 items-center gap-1.5 border border-[#333] px-3 py-1.5 text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>{sharing ? "CREATING SHARE…" : "CREATE SHARE"}</span>
            </button>
          </div>
        </div>
        {loading && (
          <AnalysisState
            kind="loading"
            title="Preparing report"
            description="Retrieving the assembled analysis, curation, citations, and controlled sharing state."
          />
        )}
        {!loading && !analysisId && (
          <AnalysisState
            kind="empty"
            title="Choose an analysis report"
            description="Reports are analysis-specific. Select a retained analysis to open its assembled, traceable report."
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
        {!loading && error && (
          <AnalysisState
            kind="error"
            title="Report unavailable"
            description={error}
            action={
              analysisId ? (
                <button
                  type="button"
                  onClick={() => {
                    setError("")
                    setReloadKey((value) => value + 1)
                  }}
                  className="min-h-10 border border-white px-3 font-bold text-white"
                >
                  RETRY
                </button>
              ) : undefined
            }
          />
        )}
        {(shareUrl || shares.some((share) => share.status === "active") || exportState) && (
          <div className="space-y-2 border border-[#333] bg-[#080808] p-3 text-zinc-300">
            {exportState && <p>HTML EXPORT: {exportState.status.toUpperCase()}</p>}
            {shareUrl && (
              <p className="break-all">
                NEW SHARE URL (shown once):{" "}
                <a className="underline" href={shareUrl}>
                  {shareUrl}
                </a>
              </p>
            )}
            {shares
              .filter((share) => share.status === "active")
              .map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between gap-3 border-t border-[#222] pt-2"
                >
                  <span>ACTIVE SHARE · {new Date(share.created_at).toLocaleString()}</span>
                  <button
                    onClick={() => void revokePublicShare(share.id).catch(showFailure)}
                    className="flex items-center gap-1 border border-red-900 px-2 py-1 text-red-300"
                  >
                    <Trash2 className="h-3 w-3" /> REVOKE
                  </button>
                </div>
              ))}
          </div>
        )}
        {curationApplied && (
          <div className="border border-amber-900 bg-amber-950/20 p-3 text-amber-300">
            CURATION APPLIED · {hiddenIds.size} hidden and {highlightedIds.size} highlighted. The
            underlying analysis remains unchanged.
          </div>
        )}
        {analysis && (
          <article className="print-report mx-auto max-w-5xl space-y-8 border border-[#333] bg-black p-4 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between border-b-2 border-white pb-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  DEBATE ANALYSER • TRACEABLE FINDINGS REPORT
                </div>
                <h2 className="mt-2 text-2xl font-extrabold uppercase leading-tight text-white">
                  {analysis?.title ?? "LOADING ANALYSIS"}
                </h2>
                <div className="mt-1 text-xs text-zinc-400">
                  Coverage summary; not a debate verdict or participant ranking.
                </div>
              </div>
              <div className="space-y-1 text-right font-mono text-[10px]">
                <div>
                  REPORT ID:{" "}
                  <span className="font-bold text-white">{analysis?.id ?? "PENDING"}</span>
                </div>
                <div>
                  DATE:{" "}
                  <span className="font-bold text-white">
                    {analysis ? new Date(analysis.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div>
                  STATUS:{" "}
                  <span className="font-bold text-white">
                    {analysis?.status.toUpperCase() ?? "LOADING"}
                  </span>
                </div>
                <div>
                  ASSEMBLY:{" "}
                  <span
                    className={
                      analysis?.assembly_ready
                        ? "font-bold text-emerald-400"
                        : "font-bold text-amber-400"
                    }
                  >
                    {analysis?.assembly_ready ? "S9 GATED" : "PENDING"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="border border-[#222] bg-[#050505] p-4">
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  TRACEABLE CLAIMS
                </div>
                <div className="mt-1 text-3xl font-extrabold text-white">{claims.length}</div>
                <div className="mt-1 text-[10px] text-zinc-400">
                  Transcript-grounded; no truth stamp
                </div>
              </div>
              <div className="border border-[#222] bg-[#050505] p-4">
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  VERIFIED SOURCE ATTACHMENTS
                </div>
                <div className="mt-1 text-3xl font-extrabold text-white">{sourceAttachments}</div>
                <div className="mt-1 text-[10px] text-zinc-400">Claim/source relations only</div>
              </div>
              <div className="border border-[#222] bg-[#050505] p-4">
                <div className="text-[10px] font-bold uppercase text-zinc-500">
                  POSSIBLE PATTERNS
                </div>
                <div className="mt-1 text-3xl font-extrabold text-white">{fallacies.length}</div>
                <div className="mt-1 text-[10px] text-zinc-400">
                  Precision-gated and contestable
                </div>
              </div>
            </div>
            <CoverageOverview overview={analysis.overview} />
            <div className="space-y-4">
              <AsciiDivider label="SECTION 1: CLAIMS, STATES & TRACEABILITY" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border border-[#262626] text-left">
                  <thead className="border-b border-[#262626] bg-[#0c0c0c] text-[10px] font-bold uppercase text-zinc-400">
                    <tr>
                      <th className="p-3">Speaker</th>
                      <th className="p-3">Claim Assertion</th>
                      <th className="p-3">State</th>
                      <th className="p-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f1f1f] text-xs">
                    {claims.map((claim) => {
                      const annotation = annotations.find((item) => item.finding_id === claim.id)
                      return (
                        <tr key={claim.id} className="hover:bg-[#080808]">
                          <td className="whitespace-nowrap p-3 font-bold text-white">
                            {claim.claim?.speaker_label ?? "Unattributed"}
                          </td>
                          <td className="p-3 leading-relaxed text-zinc-300">
                            <div>{claim.text}</div>
                            {annotation?.note && (
                              <div className="mt-2 border-l border-amber-700 pl-2 text-[10px] text-amber-200">
                                EDUCATOR NOTE: {annotation.note}
                              </div>
                            )}
                            {annotation?.highlighted && (
                              <div className="mt-1 text-[10px] font-bold text-amber-300">
                                HIGHLIGHTED
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap p-3">
                            <FindingStateLabel state={claim.state} />
                          </td>
                          <td className="whitespace-nowrap p-3">
                            <CategoricalConfidenceBadge band={claim.confidence_band} />
                          </td>
                        </tr>
                      )
                    })}
                    {claims.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-zinc-500">
                          No post-S9 traceable claim is available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <AsciiDivider label="SECTION 2: POSSIBLE FALLACY & RHETORIC PATTERNS" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {fallacies.map((finding) => {
                  const annotation = annotations.find((item) => item.finding_id === finding.id)
                  return (
                    <div
                      key={finding.id}
                      className="space-y-2 border border-[#333] bg-[#080808] p-4"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                        <span>{finding.fallacy?.possible_type ?? "POSSIBLE PATTERN"}</span>
                        <FindingStateLabel state={finding.state} />
                      </div>
                      <p className="text-xs italic text-white">“{finding.text}”</p>
                      <p className="border-t border-[#1f1f1f] pt-2 text-[11px] text-zinc-400">
                        {finding.fallacy?.why}
                      </p>
                      {annotation?.note && (
                        <p className="border-l border-amber-700 pl-2 text-[10px] text-amber-200">
                          EDUCATOR NOTE: {annotation.note}
                        </p>
                      )}
                    </div>
                  )
                })}
                {fallacies.length === 0 && (
                  <p className="text-zinc-500">
                    No precision-gated possible pattern was emitted. This is not proof that none
                    exists.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-between border-t border-[#333] pt-6 font-mono text-[10px] text-zinc-500">
              <div>READ-ONLY DISCOURSE REPORT • HTML EXPORT / CONTROLLED SHARING</div>
              <div>
                ASSEMBLED AFTER S9 TRACEABILITY GATE{curationApplied ? " · CURATION DISCLOSED" : ""}
              </div>
            </div>
          </article>
        )}
      </div>
    </AppShell>
  )
}
