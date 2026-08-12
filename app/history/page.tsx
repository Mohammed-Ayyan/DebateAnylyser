"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpDown, History, Search, Trash2 } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

type AnalysisItem = {
  id: string
  title: string
  status: "queued" | "transcribing" | "analyzing" | "partial" | "complete" | "failed"
  source_type: "upload" | "url" | "paste"
  retention_setting: "keep" | "30d" | "90d" | "delete_on_complete"
  created_at: string
  updated_at: string
}
type ListResponse = { items: AnalysisItem[]; next_cursor: string | null }
type Sort = "updated_desc" | "created_desc" | "title_asc"
const statuses = [
  "all",
  "queued",
  "transcribing",
  "analyzing",
  "partial",
  "complete",
  "failed",
] as const

export default function HistoryPage() {
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<(typeof statuses)[number]>("all")
  const [sort, setSort] = useState<Sort>("updated_desc")
  const [items, setItems] = useState<AnalysisItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const requestController = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)

  const load = useCallback(
    async (cursor?: string) => {
      requestController.current?.abort()
      const controller = new AbortController()
      requestController.current = controller
      const sequence = ++requestSequence.current
      setLoading(true)
      setError("")
      const params = new URLSearchParams({ limit: "25" })
      if (query.trim()) params.set("query", query.trim())
      if (status !== "all") params.set("status", status)
      if (cursor) params.set("cursor", cursor)
      try {
        const response = await fetch(`/api/v1/analyses?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        })
        if (!response.ok) throw new Error("Analysis history is unavailable.")
        const body = (await response.json()) as ListResponse
        if (sequence !== requestSequence.current) return
        setItems((current) => (cursor ? [...current, ...body.items] : body.items))
        setNextCursor(body.next_cursor)
      } catch (cause) {
        if (controller.signal.aborted || sequence !== requestSequence.current) return
        setError(cause instanceof Error ? cause.message : "History loading failed.")
      } finally {
        if (sequence === requestSequence.current) setLoading(false)
      }
    },
    [query, status],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250)
    return () => {
      window.clearTimeout(timeout)
      requestController.current?.abort()
    }
  }, [load])

  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (sort === "title_asc") return left.title.localeCompare(right.title)
        const field = sort === "created_desc" ? "created_at" : "updated_at"
        return new Date(right[field]).getTime() - new Date(left[field]).getTime()
      }),
    [items, sort],
  )

  const mutate = async (item: AnalysisItem, action: "resume" | "delete") => {
    if (action === "delete" && !window.confirm(`Delete “${item.title}”? This cannot be undone.`))
      return
    setPendingId(item.id)
    setError("")
    try {
      const response = await fetch(
        action === "resume" ? `/api/v1/analyses/${item.id}/resume` : `/api/v1/analyses/${item.id}`,
        {
          method: action === "resume" ? "POST" : "DELETE",
          credentials: "same-origin",
          headers:
            action === "resume"
              ? { "idempotency-key": crypto.randomUUID(), origin: window.location.origin }
              : { origin: window.location.origin },
        },
      )
      if (!response.ok) throw new Error(`The ${action} operation could not be completed.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The operation failed.")
    } finally {
      setPendingId(null)
    }
  }

  const hasFilters = Boolean(query.trim()) || status !== "all"
  const actionCell = (item: AnalysisItem) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link
        href={
          item.status === "queued" || item.status === "transcribing" || item.status === "analyzing"
            ? `/processing?analysis=${encodeURIComponent(item.id)}`
            : `/workspace?analysis=${encodeURIComponent(item.id)}`
        }
        className="inline-flex min-h-10 items-center border border-white px-3 font-bold text-white hover:bg-white hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {item.status === "complete" ? "OPEN" : "RESUME VIEW"}
      </Link>
      <Link
        href={`/reports?analysis=${encodeURIComponent(item.id)}`}
        className="inline-flex min-h-10 items-center border border-[#444] px-3 font-bold text-zinc-200 hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        REPORT
      </Link>
      {(item.status === "partial" || item.status === "failed") && (
        <button
          type="button"
          disabled={pendingId === item.id}
          onClick={() => void mutate(item, "resume")}
          className="min-h-10 border border-[#444] px-3 text-zinc-300 disabled:opacity-40"
        >
          RETRY PIPELINE
        </button>
      )}
      <button
        type="button"
        disabled={pendingId === item.id}
        onClick={() => void mutate(item, "delete")}
        className="flex min-h-10 items-center gap-1 border border-red-950 px-3 text-red-300 disabled:opacity-40"
        aria-label={`Delete ${item.title}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> DELETE
      </button>
    </div>
  )

  return (
    <AppShell>
      <main className="space-y-6 font-mono text-xs">
        <header className="flex flex-col justify-between gap-4 border border-[#262626] bg-[#080808] p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <History className="h-3.5 w-3.5" aria-hidden="true" /> [ANALYSIS HISTORY]
            </div>
            <h1 className="mt-2 text-xl font-bold uppercase text-white">Analysis Library</h1>
            <p className="mt-1 text-[11px] text-zinc-400">
              Resume processing, reopen completed work, or remove retained analyses.
            </p>
          </div>
          <AsciiBadge variant="default">{items.length} LOADED</AsciiBadge>
        </header>

        <section
          aria-label="History controls"
          className="grid gap-3 border border-[#262626] bg-black p-3 lg:grid-cols-[1fr_auto]"
        >
          <label className="relative">
            <span className="sr-only">Search analyses</span>
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by analysis title…"
              className="min-h-11 w-full border border-[#333] bg-[#080808] pl-10 pr-3 text-white outline-none focus:border-white"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 border border-[#333] bg-[#080808] px-3 text-zinc-400">
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Sort analyses</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-full bg-transparent text-white outline-none"
            >
              <option value="updated_desc">Recently updated</option>
              <option value="created_desc">Recently created</option>
              <option value="title_asc">Title A–Z</option>
            </select>
          </label>
          <div
            className="flex gap-2 overflow-x-auto pb-1 lg:col-span-2"
            aria-label="Filter analyses by status"
          >
            {statuses.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(value)}
                className={`min-h-10 shrink-0 border px-3 uppercase ${status === value ? "border-white bg-white font-bold text-black" : "border-[#333] text-zinc-400 hover:text-white"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <AnalysisState
            kind="error"
            title="History unavailable"
            description={error}
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="min-h-10 border border-white px-3 font-bold text-white"
              >
                RETRY
              </button>
            }
          />
        )}
        {loading && items.length === 0 && (
          <AnalysisState
            kind="loading"
            title="Loading analysis history"
            description="Retrieving your retained analyses and their current server status."
          />
        )}
        {!loading && !error && items.length === 0 && (
          <AnalysisState
            kind="empty"
            title={hasFilters ? "No analyses match this view" : "Your analysis library is empty"}
            description={
              hasFilters
                ? "Adjust the search or status filter to see other retained analyses."
                : "Start with an authorized file, pasted transcript, or approved public URL. Processing status and completed work will appear here."
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                    setStatus("all")
                  }}
                  className="min-h-10 border border-white px-3 font-bold text-white"
                >
                  CLEAR FILTERS
                </button>
              ) : (
                <Link
                  href="/new-analysis"
                  className="inline-flex min-h-10 items-center bg-white px-4 font-bold text-black"
                >
                  START NEW ANALYSIS
                </Link>
              )
            }
          />
        )}

        {items.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {sortedItems.map((item) => (
                <article
                  key={item.id}
                  className="space-y-3 border border-[#2a2a2a] bg-[#080808] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-bold text-white">{item.title}</h2>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        UPDATED {new Date(item.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.title.startsWith("DEMO") && (
                        <AsciiBadge variant="success">DEMO</AsciiBadge>
                      )}
                      <AsciiBadge variant="outline">{item.status}</AsciiBadge>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 border-y border-[#222] py-3 text-[10px]">
                    <div>
                      <dt className="text-zinc-600">SOURCE</dt>
                      <dd className="mt-1 uppercase text-zinc-300">{item.source_type}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-600">RETENTION</dt>
                      <dd className="mt-1 uppercase text-zinc-300">{item.retention_setting}</dd>
                    </div>
                  </dl>
                  {actionCell(item)}
                </article>
              ))}
            </div>
            <AsciiCard title="ANALYSIS RUNS" className="hidden overflow-x-auto p-0 md:block">
              <table className="w-full min-w-[760px] text-left">
                <thead className="border-b border-[#262626] bg-[#0c0c0c] text-[10px] uppercase text-zinc-500">
                  <tr>
                    <th className="p-3">Analysis</th>
                    <th className="p-3">Updated</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Retention</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1f1f1f]">
                  {sortedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#080808]">
                      <td className="max-w-xs truncate p-3 font-bold text-white">
                        <span className="flex items-center gap-2">
                          {item.title.startsWith("DEMO") && (
                            <AsciiBadge variant="success">DEMO</AsciiBadge>
                          )}
                          <span className="truncate">{item.title}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-zinc-400">
                        {new Date(item.updated_at).toLocaleString()}
                      </td>
                      <td className="p-3 uppercase text-zinc-400">{item.source_type}</td>
                      <td className="p-3">
                        <AsciiBadge variant="outline">{item.status}</AsciiBadge>
                      </td>
                      <td className="p-3 uppercase text-zinc-400">{item.retention_setting}</td>
                      <td className="p-3">{actionCell(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AsciiCard>
          </>
        )}
        {nextCursor && !loading && (
          <button
            type="button"
            onClick={() => void load(nextCursor)}
            className="min-h-11 border border-[#444] px-4 text-zinc-300 hover:border-white"
          >
            LOAD MORE
          </button>
        )}
      </main>
    </AppShell>
  )
}
