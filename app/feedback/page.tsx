import Link from "next/link"
import { ArrowRight, MessageSquareReply } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

export default function FeedbackPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 font-mono text-xs">
        <header className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [CONTEST & CORRECTION]
            </p>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Review analysis findings
            </h1>
          </div>
          <AsciiBadge variant="default">HUMAN REVIEW</AsciiBadge>
        </header>
        <AnalysisState
          kind="unavailable"
          title="No standalone feedback inbox"
          description="This build has no general feedback-ticket service, so it does not display invented tickets, identities, review boards, or automated responses."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <AsciiCard title="CONTEST A FINDING">
            <MessageSquareReply className="mb-3 h-5 w-5" />
            <p className="leading-relaxed text-zinc-400">
              Open the relevant analysis workspace, select the exact finding, and use its contest
              control. Contests stay attached to the finding and its traceability record.
            </p>
            <Link
              href="/history"
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-white underline underline-offset-4"
            >
              FIND AN ANALYSIS <ArrowRight className="h-4 w-4" />
            </Link>
          </AsciiCard>
          <AsciiCard title="CURATE A REPORT">
            <p className="leading-relaxed text-zinc-400">
              Owner annotations can highlight, hide, or add a note without changing the underlying
              automated analysis. Exported reports disclose that curation.
            </p>
            <Link
              href="/history"
              className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-white underline underline-offset-4"
            >
              OPEN HISTORY <ArrowRight className="h-4 w-4" />
            </Link>
          </AsciiCard>
        </div>
        <p className="border-l-2 border-white bg-[#080808] p-4 leading-relaxed text-zinc-400">
          Possible fallacy labels and source-credibility categories remain contestable. A contest is
          not proof that a finding is correct or incorrect, and no person-level verdict is produced.
        </p>
      </main>
    </AppShell>
  )
}
