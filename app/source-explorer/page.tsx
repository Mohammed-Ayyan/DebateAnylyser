"use client"

import Link from "next/link"
import { Check, Copy, ExternalLink, Search } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

type EvidenceSource = {
  id: string
  analysis_id: string
  url: string
  retrieved_snippet: string
  provenance: string
  tier: "T1" | "T2" | "T3"
  resolves: true
  supports_relation: "supports" | "refutes" | "neutral"
  licensing_quote_verified: true
  retrieved_at: string
  credibility_ratings?: Array<{
    id: string
    factor:
      | "editorial_standards"
      | "ownership_transparency"
      | "corrections_practice"
      | "method_transparency"
      | "source_attribution"
    level: "higher" | "mixed" | "lower"
    method_provenance: string
    rater_ref: string
    contested: true
  }>
  credibility_disagreement?: boolean
}

type EvidenceResponse = {
  finding_id: string
  verification_state: "verified" | "unverified"
  claim_spans: Array<{ segment_id: string; start_char: number; end_char: number }>
  sources: EvidenceSource[]
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return "SOURCE"
  }
}

export default function SourceExplorerPage() {
  const [query, setQuery] = useState("")
  const [selectedTier, setSelectedTier] = useState<"ALL" | "T1">("ALL")
  const [result, setResult] = useState<EvidenceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [copiedSourceId, setCopiedSourceId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    setErrorMessage("")
    const parameters = new URL(window.location.href).searchParams
    const analysisId = parameters.get("analysis")
    const findingId = parameters.get("finding")
    if (!analysisId || !findingId) {
      setErrorMessage("Open this view from a check-worthy claim to inspect its verified evidence.")
      setLoading(false)
      return
    }
    const controller = new AbortController()
    void fetch(
      `/api/v1/analyses/${encodeURIComponent(analysisId)}/findings/${encodeURIComponent(findingId)}/evidence`,
      { credentials: "same-origin", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Verified evidence could not be loaded for this claim.")
        return (await response.json()) as EvidenceResponse
      })
      .then(setResult)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : "Evidence could not be loaded.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadKey])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (result?.sources ?? []).filter((source) => {
      if (selectedTier === "T1" && source.tier !== "T1") return false
      return (
        !normalized ||
        source.url.toLowerCase().includes(normalized) ||
        source.provenance.toLowerCase().includes(normalized) ||
        source.retrieved_snippet.toLowerCase().includes(normalized) ||
        source.supports_relation.includes(normalized) ||
        (source.credibility_ratings ?? []).some(
          (rating) =>
            rating.factor.includes(normalized) ||
            rating.level.includes(normalized) ||
            rating.method_provenance.toLowerCase().includes(normalized) ||
            rating.rater_ref.toLowerCase().includes(normalized),
        )
      )
    })
  }, [query, result, selectedTier])

  const copyQuote = async (source: EvidenceSource) => {
    try {
      await navigator.clipboard.writeText(source.retrieved_snippet)
      setCopiedSourceId(source.id)
      window.setTimeout(() => setCopiedSourceId(null), 2_000)
    } catch {
      setErrorMessage("The verified quote could not be copied to the clipboard.")
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 font-mono text-xs">
        <div className="flex flex-col justify-between gap-4 border border-[#262626] bg-[#080808] p-4 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [CLAIM EVIDENCE]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Verified Source Explorer
            </h1>
          </div>
          <AsciiBadge variant={result?.verification_state === "verified" ? "success" : "outline"}>
            {result?.verification_state === "verified" ? "VERIFIED QUOTES" : "NO VERIFIED SOURCE"}
          </AsciiBadge>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search verified sources</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search URL, provenance, relation, or quote…"
              className="w-full border border-[#262626] bg-[#0a0a0a] px-3 py-2 pl-9 text-xs text-white outline-none placeholder:text-zinc-500 focus:border-white"
            />
          </label>
          <div className="flex items-center gap-2">
            {(["ALL", "T1"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setSelectedTier(tier)}
                className={`border px-3 py-2 transition-colors ${
                  selectedTier === tier
                    ? "border-white bg-white font-bold text-black"
                    : "border-[#333] bg-black text-zinc-400 hover:text-white"
                }`}
              >
                {tier === "ALL" ? "ALL SOURCES" : "TIER 1"}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div role="status" className="space-y-3 border border-[#262626] bg-black p-4">
            <div className="h-3 w-36 bg-zinc-800" />
            <div className="h-4 w-2/3 bg-zinc-800" />
            <div className="h-16 bg-[#111]" />
            <span className="sr-only">Loading verified evidence</span>
          </div>
        )}

        {errorMessage && (
          <AnalysisState
            kind="error"
            title="Evidence unavailable"
            description={errorMessage}
            action={
              errorMessage.startsWith("Open this view") ? (
                <Link
                  href="/history"
                  className="inline-flex min-h-10 items-center bg-white px-4 font-bold text-black"
                >
                  CHOOSE AN ANALYSIS
                </Link>
              ) : result === null ? (
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

        {!loading && !errorMessage && result?.sources.length === 0 && (
          <div className="border border-[#262626] bg-[#080808] p-5 text-zinc-300">
            <div className="font-bold uppercase text-white">
              Unverified — no reliable source found
            </div>
            <p className="mt-2 max-w-[70ch] leading-relaxed text-zinc-400">
              No candidate passed URL resolution, exact-quote, and claim-relation verification. This
              is not a true/false judgment; review the anchored transcript claim directly.
            </p>
          </div>
        )}

        {!loading &&
          !errorMessage &&
          result &&
          result.sources.length > 0 &&
          filtered.length === 0 && (
            <div className="border border-[#262626] bg-[#080808] p-4 text-zinc-400">
              No verified sources match the current search and tier filter.
            </div>
          )}

        <div className="space-y-4">
          {filtered.map((source) => (
            <AsciiCard key={source.id} className="space-y-3">
              <div className="flex flex-col justify-between gap-2 border-b border-[#1a1a1a] pb-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <AsciiBadge variant="success">{source.tier}</AsciiBadge>
                  <AsciiBadge variant="outline">
                    {source.supports_relation.toUpperCase()} THIS CLAIM
                  </AsciiBadge>
                </div>
                <time className="text-[10px] text-zinc-500" dateTime={source.retrieved_at}>
                  RETRIEVED: {new Date(source.retrieved_at).toLocaleString()}
                </time>
              </div>

              <div className="space-y-1">
                <h2 className="text-sm font-bold text-white">{sourceHost(source.url)}</h2>
                <div className="break-words text-[10px] text-zinc-500">{source.provenance}</div>
              </div>

              <blockquote className="border border-[#1a1a1a] bg-[#050505] p-3 text-xs italic leading-relaxed text-zinc-300">
                “{source.retrieved_snippet}”
              </blockquote>

              <div className="space-y-2 border border-[#1a1a1a] bg-black p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Categorical credibility signals
                  </span>
                  {source.credibility_disagreement && (
                    <AsciiBadge variant="outline">RATERS DISAGREE</AsciiBadge>
                  )}
                </div>
                {(source.credibility_ratings ?? []).length === 0 ? (
                  <p className="text-[10px] leading-relaxed text-zinc-500">
                    No approved rater data is available. No credibility category was inferred.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(source.credibility_ratings ?? []).map((rating) => (
                      <div key={rating.id} className="border-l border-zinc-700 pl-2 text-[10px]">
                        <div className="flex flex-wrap items-center gap-2 text-zinc-300">
                          <AsciiBadge variant="outline">{rating.level.toUpperCase()}</AsciiBadge>
                          <span>{rating.factor.replaceAll("_", " ").toUpperCase()}</span>
                        </div>
                        <p className="mt-1 text-zinc-500">
                          METHOD: {rating.method_provenance} · RATER: {rating.rater_ref}
                        </p>
                        <p className="mt-1 text-zinc-500">
                          CONTESTED METHOD — this category is one rater’s documented signal, not
                          neutral ground truth.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between gap-2 border-t border-[#1a1a1a] pt-2 text-[11px] sm:flex-row sm:items-center">
                <span className="min-w-0 truncate text-zinc-500">{source.url}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyQuote(source)}
                    className="flex items-center gap-1 border border-[#333] px-2.5 py-1 text-zinc-300 hover:text-white"
                  >
                    {copiedSourceId === source.id ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedSourceId === source.id ? "COPIED" : "COPY QUOTE"}
                  </button>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 bg-white px-2.5 py-1 font-bold text-black hover:bg-zinc-200"
                  >
                    VIEW SOURCE <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </AsciiCard>
          ))}
        </div>

        {result && (
          <p className="max-w-[75ch] text-[10px] leading-relaxed text-zinc-500">
            Relations describe only how each exact source quote bears on this specific claim. They
            are not overall truth, speaker, or source-credibility verdicts. Tier is retrieval
            provenance, not a numeric score. Credibility categories, when present, retain each
            rater’s method and contestation rather than acting as an oracle. Finding ID:{" "}
            {result.finding_id}
          </p>
        )}
      </div>
    </AppShell>
  )
}
