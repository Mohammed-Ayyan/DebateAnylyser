import { notFound } from "next/navigation"
import Link from "next/link"
import { Download, Printer } from "lucide-react"

import { getDemoFixture, isDemoTranscript } from "@/lib/demo/fixtures"
import type { DemoFinding, DemoFixture } from "@/lib/demo/fixtures"
import { AsciiBadge, AsciiDivider } from "@/components/ascii-decorations"
import { DemoPrintButton } from "./print-button"

type PageProps = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return [{ slug: "debate-demo-1" }, { slug: "debate-demo-2" }]
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  if (!isDemoTranscript(slug)) return { title: "Not Found" }
  const fixture = getDemoFixture(slug)
  return {
    title: `${fixture?.title ?? "Demo"} | Debate Analyser Demo`,
    description: `Precomputed analysis demo: ${fixture?.title}`,
  }
}

function timeLabel(ms: number): string {
  const seconds = Math.floor(ms / 1_000)
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function getSpeakerLabel(fixture: DemoFixture, speakerId: string | null): string {
  if (!speakerId) return "UNATTRIBUTED"
  const speaker = fixture.speakers.find((s) => s.id === speakerId)
  return speaker?.displayName ?? speaker?.label ?? "UNATTRIBUTED"
}

function getClaimSpeakerLabel(fixture: DemoFixture, finding: DemoFinding): string {
  if (finding.claim?.speakerId) {
    return getSpeakerLabel(fixture, finding.claim.speakerId)
  }
  return "UNATTRIBUTED"
}

export default async function DemoViewerPage({ params }: PageProps) {
  const { slug } = await params

  if (!isDemoTranscript(slug)) {
    notFound()
  }

  const fixture = getDemoFixture(slug)
  if (!fixture) {
    notFound()
  }

  const claims = fixture.findings.filter((f) => f.kind === "claim")
  const fallacies = fixture.findings.filter((f) => f.kind === "fallacy")
  const supportFindings = fixture.findings.filter((f) => f.kind === "support")
  const structureFindings = fixture.findings.filter((f) => f.kind === "structure")

  const overview = fixture.overview
  const distribution = overview.distribution

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-xs sm:px-6">
      {/* Demo banner */}
      <div
        role="status"
        className="border border-emerald-800/60 bg-emerald-950/30 p-3 text-center text-[11px] font-bold uppercase tracking-wider text-emerald-300"
      >
        DEMO — PRECOMPUTED ANALYSIS · No live providers were called
      </div>

      {/* Report header */}
      <header className="flex flex-col gap-4 border border-[#262626] bg-[#080808] p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            DEBATE ANALYSER • DEMO REPORT
          </div>
          <h1 className="mt-2 text-xl font-extrabold uppercase leading-tight text-white sm:text-2xl">
            {fixture.title}
          </h1>
          <div className="mt-1 text-xs text-zinc-400">
            Coverage summary; not a debate verdict or participant ranking.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <AsciiBadge variant="success">ASSEMBLED</AsciiBadge>
            <AsciiBadge variant="outline">{fixture.language.toUpperCase()}</AsciiBadge>
            <AsciiBadge variant="warning">PRECOMPUTED</AsciiBadge>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <DemoPrintButton />
          <a
            href={fixture.transcriptPath}
            download
            className="flex min-h-9 items-center gap-1.5 border border-[#333] bg-[#141414] px-3 text-zinc-300 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>DOWNLOAD TRANSCRIPT</span>
          </a>
        </div>
      </header>

      {/* Pipeline stages */}
      <section className="border border-[#262626] bg-[#080808] p-4">
        <h2 className="text-[10px] font-bold uppercase text-zinc-500">PIPELINE STAGES (S0–S10)</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {fixture.stageRuns.map((run) => (
            <span
              key={run.stage}
              className={`border px-2 py-1 text-[10px] font-bold uppercase ${
                run.status === "complete"
                  ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
                  : run.status === "failed"
                    ? "border-red-800 bg-red-950/30 text-red-300"
                    : run.status === "skipped"
                      ? "border-zinc-700 bg-zinc-900/30 text-zinc-400"
                      : "border-amber-800 bg-amber-950/30 text-amber-300"
              }`}
            >
              {run.stage}: {run.status}
            </span>
          ))}
        </div>
      </section>

      {/* Coverage overview */}
      <section
        aria-labelledby="demo-coverage-title"
        className="space-y-3 border border-[#262626] bg-[#080808] p-4"
      >
        <div>
          <h2 id="demo-coverage-title" className="text-xs font-bold uppercase text-white">
            Finding Distribution
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
            Counts describe emitted traceable material. They are not scores, rankings, truth
            judgments, or a debate winner.
          </p>
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["claims", "Traceable claims"],
              ["supportPresent", "Speaker support present"],
              ["supportWeak", "Speaker support limited"],
              ["supportAbsent", "Speaker support not found"],
              ["supportInsufficient", "Support assessment insufficient"],
              ["verifiedSources", "Verified source attachments"],
              ["possiblePatterns", "Possible rhetoric patterns"],
            ] as const
          ).map(([key, label]) => {
            const value = distribution[key]
            const max = Math.max(1, ...Object.values(distribution))
            return (
              <div key={key} className="border border-[#222] bg-black p-2.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-400">{label}</dt>
                  <dd className="font-bold text-white">{value}</dd>
                </div>
                <div className="mt-2 h-1 bg-[#222]" aria-hidden="true">
                  <div className="h-full bg-white" style={{ width: `${(value / max) * 100}%` }} />
                </div>
              </div>
            )
          })}
        </dl>
        <p className="border-t border-[#222] pt-3 leading-relaxed text-zinc-300">
          {overview.topInsight}
        </p>
      </section>

      {/* Speakers */}
      <section className="border border-[#262626] bg-[#080808] p-4">
        <h2 className="text-[10px] font-bold uppercase text-zinc-500">SPEAKERS</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {fixture.speakers.map((speaker) => (
            <div key={speaker.id} className="border border-[#333] bg-black px-3 py-2">
              <span className="font-bold text-white">{speaker.displayName ?? speaker.label}</span>
              <span className="ml-2 text-[10px] text-zinc-500">
                {fixture.segments.filter((s) => s.speakerId === speaker.id).length} segments
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Claims table */}
      <section className="space-y-4">
        <AsciiDivider label="SECTION 1: CLAIMS, STATES & TRACEABILITY" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border border-[#262626] text-left">
            <thead className="border-b border-[#262626] bg-[#0c0c0c] text-[10px] font-bold uppercase text-zinc-400">
              <tr>
                <th className="p-3">Speaker</th>
                <th className="p-3">Claim Assertion</th>
                <th className="p-3">Type</th>
                <th className="p-3">State</th>
                <th className="p-3">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f1f] text-xs">
              {claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-[#080808]">
                  <td className="whitespace-nowrap p-3 font-bold text-white">
                    {getClaimSpeakerLabel(fixture, claim)}
                  </td>
                  <td className="p-3 leading-relaxed text-zinc-300">{claim.text}</td>
                  <td className="whitespace-nowrap p-3 text-zinc-400">
                    {claim.claim?.claimType?.toUpperCase() ?? "—"}
                  </td>
                  <td className="whitespace-nowrap p-3">
                    <StateLabel state={claim.state} />
                  </td>
                  <td className="whitespace-nowrap p-3">
                    <ConfidenceLabel band={claim.confidenceBand} />
                  </td>
                </tr>
              ))}
              {claims.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-zinc-500">
                    No traceable claims in this demo fixture.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Support assessment */}
      <section className="space-y-4">
        <AsciiDivider label="SECTION 2: SUPPORT ASSESSMENT" />
        <div className="grid gap-3 sm:grid-cols-2">
          {supportFindings.map((finding) => (
            <div key={finding.id} className="space-y-2 border border-[#333] bg-[#080808] p-4">
              <div className="flex items-center justify-between text-[10px] uppercase text-zinc-500">
                <span>SUPPORT: {finding.support?.supportLevel?.toUpperCase() ?? "PENDING"}</span>
                <StateLabel state={finding.state} />
              </div>
              <p className="text-xs text-white">{finding.text}</p>
              {finding.support?.rationale && (
                <p className="border-t border-[#1f1f1f] pt-2 text-[11px] text-zinc-400">
                  {finding.support.rationale}
                </p>
              )}
              <div className="text-[10px] text-zinc-600">
                Reason: {finding.support?.reasonCode ?? "—"}
              </div>
            </div>
          ))}
          {supportFindings.length === 0 && (
            <p className="text-zinc-500">No support findings in this demo.</p>
          )}
        </div>
      </section>

      {/* Argument structure */}
      <section className="space-y-4">
        <AsciiDivider label="SECTION 3: ARGUMENT STRUCTURE" />
        <div className="grid gap-3 sm:grid-cols-2">
          {structureFindings.map((finding) => (
            <div key={finding.id} className="space-y-2 border border-[#333] bg-[#080808] p-4">
              <div className="flex items-center justify-between text-[10px] uppercase text-zinc-500">
                <span>ROLE: {finding.structure?.role?.toUpperCase() ?? "—"}</span>
                {finding.structure?.inferred && <AsciiBadge variant="warning">INFERRED</AsciiBadge>}
              </div>
              <p className="text-xs text-white">{finding.text}</p>
            </div>
          ))}
          {structureFindings.length === 0 && (
            <p className="text-zinc-500">No structure findings in this demo.</p>
          )}
        </div>
        {fixture.structureEdges.length > 0 && (
          <div className="border border-[#262626] bg-[#050505] p-4">
            <h3 className="text-[10px] font-bold uppercase text-zinc-500">
              ARGUMENT GRAPH EDGES ({fixture.structureEdges.length})
            </h3>
            <div className="mt-3 space-y-1">
              {fixture.structureEdges.map((edge) => (
                <div key={edge.id} className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <span className="font-mono text-zinc-500">{edge.fromFindingId.slice(0, 8)}</span>
                  <span className="text-white">→ {edge.relation.toUpperCase()} →</span>
                  <span className="font-mono text-zinc-500">{edge.toFindingId.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Fallacies / rhetoric */}
      <section className="space-y-4">
        <AsciiDivider label="SECTION 4: POSSIBLE FALLACY & RHETORIC PATTERNS" />
        <div className="grid gap-4 sm:grid-cols-2">
          {fallacies.map((finding) => (
            <div key={finding.id} className="space-y-2 border border-[#333] bg-[#080808] p-4">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <span>{finding.fallacy?.possibleType ?? "POSSIBLE PATTERN"}</span>
                <StateLabel state={finding.state} />
              </div>
              <p className="text-xs italic text-white">&ldquo;{finding.text}&rdquo;</p>
              <p className="border-t border-[#1f1f1f] pt-2 text-[11px] text-zinc-400">
                {finding.fallacy?.why}
              </p>
              {finding.fallacy?.caveat && (
                <p className="text-[10px] text-zinc-500">Caveat: {finding.fallacy.caveat}</p>
              )}
              <div className="text-[10px] text-zinc-600">
                Taxonomy: {finding.fallacy?.taxonomyRef ?? "—"}
              </div>
            </div>
          ))}
          {fallacies.length === 0 && (
            <p className="text-zinc-500">No precision-gated possible pattern was emitted.</p>
          )}
        </div>
      </section>

      {/* Transcript */}
      <section className="space-y-4">
        <AsciiDivider label="SECTION 5: TRANSCRIPT" />
        <div className="max-h-[600px] space-y-2 overflow-y-auto border border-[#262626] bg-[#050505] p-4">
          {fixture.segments.map((segment) => {
            const segmentFindings = fixture.findings.filter((f) =>
              f.spanRefs.some((ref) => ref.segmentId === segment.id),
            )
            return (
              <div
                key={segment.id}
                className="border border-[#1a1a1a] bg-black p-3 hover:border-[#333]"
              >
                <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">
                      {getSpeakerLabel(fixture, segment.speakerId)}
                    </span>
                    {segmentFindings.some((f) => f.kind === "claim") && (
                      <AsciiBadge variant="success">CLAIM</AsciiBadge>
                    )}
                    {segmentFindings.some((f) => f.kind === "fallacy") && (
                      <AsciiBadge variant="warning">PATTERN</AsciiBadge>
                    )}
                    {segment.lowConf && <AsciiBadge variant="warning">LOW ASR</AsciiBadge>}
                  </div>
                  <span>{timeLabel(segment.startMs)}</span>
                </div>
                <p className="leading-relaxed text-zinc-300">{segment.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col items-center justify-between gap-4 border-t border-[#333] pt-6 text-[10px] text-zinc-500 sm:flex-row">
        <span>READ-ONLY DEMO REPORT • PRECOMPUTED FROM S0–S10 PIPELINE</span>
        <div className="flex gap-3">
          <Link href="/demo" className="hover:text-white">
            ← BACK TO DEMOS
          </Link>
          <Link href="/auth/signup" className="hover:text-white">
            CREATE ACCOUNT
          </Link>
        </div>
      </div>
    </main>
  )
}

/* ---------- Inline helper components ---------- */

function StateLabel({ state }: { state: string }) {
  if (state === "contested") {
    return <AsciiBadge variant="warning">CONTESTED</AsciiBadge>
  }
  if (state === "insufficient") {
    return <AsciiBadge variant="warning">INSUFFICIENT EVIDENCE</AsciiBadge>
  }
  return <AsciiBadge variant="outline">TRACEABLE</AsciiBadge>
}

function ConfidenceLabel({ band }: { band: string | null }) {
  const labels: Record<string, string> = {
    high: "HIGH CONFIDENCE",
    medium: "MEDIUM CONFIDENCE",
    low: "LOW CONFIDENCE",
    insufficient: "INSUFFICIENT CONFIDENCE",
  }
  const label = band ? (labels[band] ?? band.toUpperCase()) : "—"
  const variant = band === "high" ? "success" : band === "insufficient" ? "warning" : "outline"
  return <AsciiBadge variant={variant as "success" | "warning" | "outline"}>{label}</AsciiBadge>
}
