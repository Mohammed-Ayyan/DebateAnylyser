import type { AnalysisOverview } from "@/lib/contracts/analysis"

const labels: Array<[keyof AnalysisOverview["distribution"], string]> = [
  ["claims", "Traceable claims"],
  ["support_present", "Speaker support present"],
  ["support_weak", "Speaker support limited"],
  ["support_absent", "Speaker support not found"],
  ["support_insufficient", "Support assessment insufficient"],
  ["verified_sources", "Verified source attachments"],
  ["possible_patterns", "Possible rhetoric patterns"],
]

export function CoverageOverview({ overview }: { overview: AnalysisOverview | null }) {
  if (!overview) {
    return (
      <p className="border border-[#262626] p-3 text-zinc-500">
        Coverage distribution is withheld until S9 traceability assembly completes.
      </p>
    )
  }
  const maximum = Math.max(1, ...Object.values(overview.distribution))
  return (
    <section
      aria-labelledby="coverage-distribution-title"
      className="space-y-3 border border-[#262626] bg-[#080808] p-4"
    >
      <div>
        <h2 id="coverage-distribution-title" className="text-xs font-bold uppercase text-white">
          Finding distribution
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          Counts describe emitted traceable material. They are not scores, rankings, truth
          judgments, or a debate winner.
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {labels.map(([key, label]) => {
          const value = overview.distribution[key]
          return (
            <div key={key} className="border border-[#222] bg-black p-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-400">{label}</dt>
                <dd className="font-bold text-white">{value}</dd>
              </div>
              <div className="mt-2 h-1 bg-[#222]" aria-hidden="true">
                <div className="h-full bg-white" style={{ width: `${(value / maximum) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </dl>
      <p className="border-t border-[#222] pt-3 leading-relaxed text-zinc-300">
        {overview.top_insight}
      </p>
    </section>
  )
}
