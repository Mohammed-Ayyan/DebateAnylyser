"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, FileText, History, Plus, Radio, RefreshCw } from "lucide-react"

import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import type { HistoryListItem, HistoryListResponse } from "@/lib/history/contracts"

const ACTIVE_STATUSES = new Set<HistoryListItem["status"]>([
  "queued",
  "transcribing",
  "analyzing",
  "partial",
])

function formatStatus(status: HistoryListItem["status"]) {
  return status.replaceAll("_", " ").toUpperCase()
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  )
}

export default function DashboardPage() {
  const [items, setItems] = useState<HistoryListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadRecent = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/v1/analyses?limit=6", {
        credentials: "same-origin",
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Recent analyses are temporarily unavailable.")
      const body = (await response.json()) as HistoryListResponse
      setItems(body.items)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recent analyses could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRecent()
  }, [])

  const activeCount = items.filter((item) => ACTIVE_STATUSES.has(item.status)).length
  const completeCount = items.filter((item) => item.status === "complete").length

  return (
    <AppShell>
      <div className="space-y-6 text-xs">
        <section
          data-tour="dashboard-overview"
          aria-labelledby="dashboard-title"
          className="grid gap-5 border border-[#333] bg-[#080808] p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end sm:p-6"
        >
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Workspace overview
            </p>
            <h1
              id="dashboard-title"
              className="mt-2 text-2xl font-bold uppercase tracking-tight text-white sm:text-3xl"
            >
              Move from source to traceable analysis
            </h1>
            <p className="mt-3 max-w-xl leading-relaxed text-zinc-400">
              Start an analysis, follow processing status, and return to completed work. Findings
              remain bounded by the product&apos;s traceability and confidence rules.
            </p>
          </div>
          <div data-tour="dashboard-actions" className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/new-analysis"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-white px-5 font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Plus className="h-4 w-4" /> NEW ANALYSIS
            </Link>
            <Link
              href="/live-debate"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#444] px-5 font-bold text-white transition-colors hover:border-white hover:bg-[#141414] focus-visible:outline-2 focus-visible:outline-white"
            >
              <Radio className="h-4 w-4" /> LIVE DEBATE
            </Link>
          </div>
        </section>

        <section aria-label="Recent workspace status" className="grid gap-4 sm:grid-cols-3">
          <AsciiCard title="RECENTLY VISIBLE">
            <p className="text-3xl font-bold text-white">{loading ? "—" : items.length}</p>
            <p className="mt-2 text-zinc-500">Latest analyses returned by your workspace.</p>
          </AsciiCard>
          <AsciiCard title="IN PROGRESS">
            <p className="text-3xl font-bold text-white">{loading ? "—" : activeCount}</p>
            <p className="mt-2 text-zinc-500">Queued, processing, or resumable recent runs.</p>
          </AsciiCard>
          <AsciiCard title="COMPLETE">
            <p className="text-3xl font-bold text-white">{loading ? "—" : completeCount}</p>
            <p className="mt-2 text-zinc-500">Completed runs in this recent view.</p>
          </AsciiCard>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <section
            data-tour="recent-work"
            aria-labelledby="recent-work-title"
            className="border border-[#262626] bg-[#050505]"
          >
            <div className="flex min-h-14 items-center justify-between border-b border-[#262626] px-4">
              <div>
                <h2 id="recent-work-title" className="font-bold uppercase text-white">
                  Recent work
                </h2>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  Your six most recently created analyses
                </p>
              </div>
              <Link
                href="/history"
                className="inline-flex min-h-11 items-center gap-2 text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              >
                VIEW ALL <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div aria-live="polite">
              {loading && <div className="p-8 text-center text-zinc-500">LOADING RECENT WORK…</div>}
              {!loading && error && (
                <div className="m-4 border border-red-900 bg-red-950/20 p-4 text-red-200">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadRecent()}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 border border-red-700 px-3 font-bold hover:border-red-400"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> RETRY
                  </button>
                </div>
              )}
              {!loading && !error && items.length === 0 && (
                <div className="p-8 sm:p-10">
                  <p className="font-bold text-white">NO ANALYSES YET</p>
                  <p className="mt-2 max-w-lg leading-relaxed text-zinc-500">
                    Create your first analysis to populate recent work. No sample projects or
                    invented metrics are shown.
                  </p>
                  <Link
                    href="/new-analysis"
                    className="mt-5 inline-flex min-h-11 items-center gap-2 bg-white px-4 font-bold text-black hover:bg-zinc-200"
                  >
                    <Plus className="h-4 w-4" /> CREATE FIRST ANALYSIS
                  </Link>
                </div>
              )}
              {!loading && !error && items.length > 0 && (
                <ul className="divide-y divide-[#202020]">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#0a0a0a] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/workspace?analysis=${encodeURIComponent(item.id)}`}
                          className="block truncate font-bold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white"
                        >
                          {item.title}
                        </Link>
                        <p className="mt-1 text-[10px] uppercase text-zinc-500">
                          {item.source_type} · {formatDate(item.created_at)}
                        </p>
                      </div>
                      <AsciiBadge variant={item.status === "failed" ? "warning" : "default"}>
                        {formatStatus(item.status)}
                      </AsciiBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="space-y-4" aria-label="Workspace shortcuts">
            <AsciiCard title="LIVE DEBATE">
              <Radio className="h-5 w-5 text-white" />
              <p className="mt-3 leading-relaxed text-zinc-400">
                Open the live workflow for an active debate session.
              </p>
              <Link
                href="/live-debate"
                className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-white hover:underline"
              >
                OPEN LIVE DEBATE <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </AsciiCard>
            <AsciiCard title="ANALYSIS REPORTS">
              <FileText className="h-5 w-5 text-white" />
              <p className="mt-3 leading-relaxed text-zinc-400">
                Choose a completed analysis in History to open its traceable report and stated
                limitations.
              </p>
              <Link
                href="/history"
                className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-white hover:underline"
              >
                CHOOSE AN ANALYSIS <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </AsciiCard>
            <Link
              href="/history"
              className="flex min-h-12 items-center justify-between border border-[#333] px-4 font-bold text-zinc-300 transition-colors hover:border-white hover:text-white"
            >
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" /> ANALYSIS HISTORY
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
