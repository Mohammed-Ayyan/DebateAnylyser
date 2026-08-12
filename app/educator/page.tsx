import Link from "next/link"

import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

export default function EducatorDashboardPage() {
  return (
    <AppShell>
      <div className="space-y-6 font-mono text-xs">
        <div className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [EDUCATOR CURATION]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Annotation & Presentation Workspace
            </h1>
          </div>
          <AsciiBadge variant="default">OWNER-SCOPED</AsciiBadge>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AsciiCard title="ANNOTATIONS">
            <div className="mt-2 text-sm font-bold text-white">FINDING NOTES</div>
            <div className="mt-1 text-[10px] text-zinc-500">Questions and teaching context</div>
          </AsciiCard>
          <AsciiCard title="PRESENTATION">
            <div className="mt-2 text-sm font-bold text-white">HIDE / HIGHLIGHT</div>
            <div className="mt-1 text-[10px] text-zinc-500">Non-destructive curation</div>
          </AsciiCard>
          <AsciiCard title="DISCLOSURE">
            <div className="mt-2 text-sm font-bold text-white">CURATION MARKED</div>
            <div className="mt-1 text-[10px] text-zinc-500">
              Underlying findings remain available
            </div>
          </AsciiCard>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <AsciiCard title="HOW TO CURATE" className="space-y-3 lg:col-span-7">
            <p className="text-zinc-300">
              Open an owner analysis, select any traceable finding, and use the existing Notes panel
              to add a note, highlight it, or hide it from curated report views.
            </p>
            <Link
              href="/workspace"
              className="inline-block border border-white bg-white px-4 py-2 font-bold text-black"
            >
              OPEN ANALYSIS WORKSPACE
            </Link>
          </AsciiCard>
          <AsciiCard title="CURRENT SCOPE" className="space-y-2 lg:col-span-5">
            <p className="text-zinc-400">
              Classrooms, cohorts, student identities, grading, and numeric class metrics are not
              active. Those multi-user capabilities remain deferred to F24.
            </p>
            <p className="text-zinc-500">
              M9 curation never changes AI findings or creates a debate-quality score.
            </p>
          </AsciiCard>
        </div>
      </div>
    </AppShell>
  )
}
