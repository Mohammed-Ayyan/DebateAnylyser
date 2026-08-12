import type { EvidenceSource } from "@/lib/contracts/analysis"

export function EvidenceDrawer({ sources }: { sources: EvidenceSource[] }) {
  if (sources.length === 0) {
    return (
      <div className="space-y-2">
        <p className="border border-[#262626] bg-[#080808] p-3 text-xs text-zinc-500">
          No verified external source is attached to this finding.
        </p>
        <p className="border border-amber-900/40 bg-amber-950/10 p-3 text-[10px] leading-relaxed text-amber-200/70">
          External evidence retrieval (S6) and source credibility signals (S7) are deferred until a
          reviewed evidence-retriever and rater service are configured. This is not a judgment that
          the claim is false or unverified; only that no external source was attached by the
          pipeline.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase text-zinc-500">
        VERIFIED CLAIM/SOURCE RELATIONSHIPS
      </div>
      {sources.map((source) => (
        <article key={source.id} className="space-y-2 border border-[#333] bg-[#0a0a0a] p-3">
          <div className="flex justify-between text-[10px] font-bold text-zinc-400">
            <span>{source.tier}</span>
            <span>{source.supports_relation.toUpperCase()}</span>
          </div>
          <p className="text-[11px] italic text-zinc-300">“{source.retrieved_snippet}”</p>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="block break-all text-[10px] text-white underline"
          >
            {source.provenance}
          </a>
          <p className="text-[9px] text-zinc-500">
            Relation applies only to this claim/source pair; credibility ratings are categorical,
            method-provenanced, and contestable.
          </p>
        </article>
      ))}
    </div>
  )
}
