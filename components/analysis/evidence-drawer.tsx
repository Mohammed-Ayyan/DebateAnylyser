import type { EvidenceSource } from "@/lib/contracts/analysis"

function factorLabel(value: string): string {
  return value.replaceAll("_", " ")
}

function levelBadgeColor(level: string): string {
  switch (level) {
    case "higher":
      return "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
    case "mixed":
      return "border-amber-800/60 bg-amber-950/40 text-amber-300"
    case "lower":
      return "border-rose-800/60 bg-rose-950/40 text-rose-300"
    default:
      return "border-zinc-800 bg-zinc-900 text-zinc-400"
  }
}

export function EvidenceDrawer({ sources }: { sources: EvidenceSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="space-y-2">
        <p className="border border-[#262626] bg-[#080808] p-3 text-xs text-zinc-500">
          No verified external source is attached to this finding.
        </p>
        <p className="border border-amber-900/40 bg-amber-950/10 p-3 text-[10px] leading-relaxed text-amber-200/70">
          External evidence retrieval (S6) and source credibility signals (S7) are evaluated on
          check-worthy factual and causal claims. Absence of external evidence is not a judgment
          that a claim is false or unverified; only that no external source was attached by the
          retrieval pipeline.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        VERIFIED CLAIM / SOURCE RELATIONSHIPS ({sources.length})
      </div>
      {sources.map((source) => {
        const ratings = source.credibility_ratings ?? []
        return (
          <article
            key={source.id}
            className="space-y-2.5 border border-[#333] bg-[#0a0a0a] p-3.5 rounded-sm"
          >
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">{source.tier}</span>
              <span
                className={`rounded px-1.5 py-0.5 uppercase tracking-wide ${
                  source.supports_relation === "supports"
                    ? "border border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
                    : source.supports_relation === "refutes"
                      ? "border border-rose-900/60 bg-rose-950/40 text-rose-300"
                      : "border border-zinc-800 bg-zinc-900 text-zinc-400"
                }`}
              >
                {source.supports_relation}
              </span>
            </div>

            <blockquote className="border-l-2 border-zinc-700 pl-2.5 text-[11px] italic leading-relaxed text-zinc-200">
              “{source.retrieved_snippet}”
            </blockquote>

            <div className="pt-1">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-[11px] font-medium text-blue-400 hover:text-blue-300 underline"
              >
                {source.provenance}
              </a>
              <span className="text-[9px] text-zinc-500">
                Retrieved: {new Date(source.retrieved_at).toLocaleString()}
              </span>
            </div>

            {ratings.length > 0 ? (
              <div className="mt-2 space-y-1.5 border-t border-[#222] pt-2">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                  <span>Source Credibility Signals</span>
                  {source.credibility_disagreement && (
                    <span className="rounded border border-amber-800/80 bg-amber-950/50 px-1 py-0.5 text-[8px] text-amber-300">
                      Raters Disagree
                    </span>
                  )}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {ratings.map((rating) => (
                    <div
                      key={rating.id}
                      className="rounded border border-zinc-900 bg-zinc-950/70 p-1.5 text-[9px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize text-zinc-300">
                          {factorLabel(rating.factor)}
                        </span>
                        <span
                          className={`rounded px-1 text-[8px] font-bold uppercase border ${levelBadgeColor(
                            rating.level,
                          )}`}
                        >
                          {rating.level}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[8px] text-zinc-500">
                        {rating.method_provenance} ({rating.rater_ref})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[9px] text-zinc-500 italic">
                No categorical credibility metadata recorded for this publisher domain.
              </p>
            )}

            <p className="text-[8px] leading-tight text-zinc-600">
              Relation applies strictly to this claim/source pair. Credibility signals reflect
              organizational transparency and methodology, not truthfulness of individual claims.
            </p>
          </article>
        )
      })}
    </div>
  )
}
