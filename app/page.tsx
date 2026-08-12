import Link from "next/link"
import { ArrowRight, FileSearch, History, Radio, ShieldCheck } from "lucide-react"

import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"

const principles = [
  ["TRACEABLE OR SILENT", "Findings require transcript anchors; unsupported output is withheld."],
  [
    "CLAIM-LEVEL EVIDENCE",
    "External sources relate to specific claims, not to a person or an entire debate.",
  ],
  [
    "CATEGORICAL CONFIDENCE",
    "Results use High, Medium, Low, or Insufficient rather than public model percentages.",
  ],
] as const

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-black font-mono text-white selection:bg-white selection:text-black">
      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-[#262626] bg-black/95 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-white text-sm font-bold text-black">
            DBT
          </span>
          <span>
            <strong className="block tracking-wider">DEBATE ANALYSER</strong>
            <small className="text-[9px] tracking-widest text-zinc-500">
              EVIDENCE OVER OPINION
            </small>
          </span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2 text-xs">
          <Link
            href="/auth/signin"
            className="min-h-10 border border-[#333] px-3 py-2.5 text-zinc-300 hover:border-white"
          >
            SIGN IN
          </Link>
          <Link href="/dashboard" className="min-h-10 bg-white px-3 py-2.5 font-bold text-black">
            OPEN WORKSPACE
          </Link>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-6xl border-b border-[#262626] px-5 py-20 sm:py-28">
          <AsciiBadge variant="outline">DISCOURSE ANALYSIS · BOUNDED OUTPUT</AsciiBadge>
          <h1 className="mt-6 max-w-4xl text-4xl font-extrabold uppercase tracking-tight sm:text-6xl">
            Evidence Over Opinion.
          </h1>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Turn authorized debates, interviews, and speeches into transcript-grounded claims,
            possible argument patterns, and claim-specific source relationships—without winner,
            truth, or person-level verdicts.
          </p>
          <div className="mt-8 flex flex-col gap-3 text-xs sm:flex-row">
            <Link
              href="/new-analysis"
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-white px-5 font-bold text-black"
            >
              ANALYZE DISCOURSE FILE <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/live-debate"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-[#444] px-5 font-bold"
            >
              CHECK LIVE DEBATE READINESS <Radio className="h-4 w-4" />
            </Link>
          </div>
        </section>
        <section
          aria-labelledby="principles-title"
          className="mx-auto max-w-6xl border-b border-[#262626] px-5 py-16"
        >
          <p className="text-[10px] font-bold tracking-[0.18em] text-zinc-400">
            HOW TO READ THE OUTPUT
          </p>
          <h2 id="principles-title" className="mt-2 text-2xl font-bold uppercase">
            Bounded by design
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {principles.map(([title, copy]) => (
              <AsciiCard key={title} title={title}>
                <ShieldCheck className="mb-4 h-5 w-5" />
                <p className="leading-relaxed text-zinc-400">{copy}</p>
              </AsciiCard>
            ))}
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-5 py-16 md:grid-cols-3">
          <AsciiCard title="AUTHORIZED INPUT">
            <FileSearch className="mb-4 h-5 w-5" />
            <p className="text-zinc-400">
              Upload supported files, paste authorized text, or submit an approved public HTTPS
              source.
            </p>
          </AsciiCard>
          <AsciiCard title="DURABLE PROCESSING">
            <History className="mb-4 h-5 w-5" />
            <p className="text-zinc-400">
              Follow server-authoritative stages and return to retained analyses from History.
            </p>
          </AsciiCard>
          <AsciiCard title="HONEST AVAILABILITY">
            <Radio className="mb-4 h-5 w-5" />
            <p className="text-zinc-400">
              Unavailable providers and live controls remain explicitly disabled rather than
              simulated.
            </p>
          </AsciiCard>
        </section>
      </main>
      <footer className="border-t border-[#262626] px-5 py-8 text-[10px] text-zinc-500">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4">
          <span>DEBATE ANALYSER · TRACEABLE FINDINGS</span>
          <nav aria-label="Legal and help" className="flex gap-4">
            <Link href="/legal" className="hover:text-white">
              LEGAL & PRIVACY
            </Link>
            <Link href="/help" className="hover:text-white">
              HELP
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
