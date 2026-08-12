"use client"

import React, { useState } from "react"
import { Download, FileText, X } from "lucide-react"

interface ExportModalProps {
  open: boolean
  onClose: () => void
}

type ExportState = {
  id: string
  status: "queued" | "processing" | "complete" | "failed" | "revoked"
  download_url?: string
}

export function ExportModal({ open, onClose }: ExportModalProps) {
  const [current, setCurrent] = useState<ExportState | null>(null)
  const [error, setError] = useState("")
  const analysisId =
    typeof window === "undefined"
      ? null
      : new URL(window.location.href).searchParams.get("analysis")

  if (!open) return null

  const poll = async (id: string) => {
    if (!analysisId) return
    const response = await fetch(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}/exports/${encodeURIComponent(id)}`,
      { credentials: "same-origin", cache: "no-store" },
    )
    if (!response.ok) throw new Error("Report export status is unavailable.")
    const next = (await response.json()) as ExportState
    setCurrent(next)
    if (next.status === "complete" && next.download_url) {
      window.location.assign(next.download_url)
    } else if (next.status === "queued" || next.status === "processing") {
      window.setTimeout(() => void poll(id).catch(handleError), 1_500)
    }
  }

  const handleError = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Report export failed.")
  }
  const requestHtml = async () => {
    if (!analysisId) return
    setError("")
    const response = await fetch(`/api/v1/analyses/${encodeURIComponent(analysisId)}/exports`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", origin: window.location.origin },
      body: JSON.stringify({ format: "html" }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      throw new Error(body?.error?.message ?? "HTML report export is unavailable.")
    }
    const created = (await response.json()) as ExportState
    setCurrent(created)
    await poll(created.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs backdrop-blur-xs">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="w-full max-w-xl border border-[#333] bg-black shadow-2xl"
      >
        <div className="flex h-12 items-center justify-between border-b border-[#262626] bg-[#080808] px-4">
          <div className="flex items-center gap-2 text-white">
            <Download className="h-4 w-4 text-zinc-400" />
            <span id="export-dialog-title" className="font-bold uppercase tracking-wider">
              Export Analysis Report
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center text-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Close export dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase text-zinc-500">
              Available formats
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={
                  !analysisId || current?.status === "queued" || current?.status === "processing"
                }
                onClick={() => void requestHtml().catch(handleError)}
                className="flex items-center gap-3 border border-white bg-[#141414] p-3 text-left text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-4 w-4" />
                <span>
                  <strong>HTML report</strong>
                  <br />
                  <span className="text-zinc-400">Immutable read-only artifact</span>
                </span>
              </button>
              <button
                onClick={() => {
                  onClose()
                  window.setTimeout(() => window.print(), 150)
                }}
                className="flex items-center gap-3 border border-[#555] bg-[#141414] p-3 text-left text-white hover:border-white"
              >
                <FileText className="h-4 w-4" />
                <span>
                  <strong>PDF (Print)</strong>
                  <br />
                  <span className="text-zinc-400">
                    Opens browser print — choose &quot;Save as PDF&quot;
                  </span>
                </span>
              </button>
            </div>
          </div>
          {!analysisId && (
            <p className="border border-amber-900 p-3 text-amber-300">
              Open this dialog from a URL containing an analysis query parameter to export.
            </p>
          )}
          {current && (
            <p className="border border-[#333] p-3 text-zinc-300">
              EXPORT STATUS: {current.status.toUpperCase()}
            </p>
          )}
          {error && <p className="border border-red-900 p-3 text-red-300">{error}</p>}
          <p className="text-[10px] leading-relaxed text-zinc-500">
            The report contains the approved post-S9 public projection, owner curation, contests,
            disclaimer, and limitations. No fabricated preview is shown.
          </p>
        </div>
        <div className="flex justify-end border-t border-[#262626] bg-[#050505] p-4">
          <button
            onClick={onClose}
            className="border border-[#333] px-3 py-1.5 text-zinc-300 hover:text-white"
          >
            CLOSE
          </button>
        </div>
      </section>
    </div>
  )
}
