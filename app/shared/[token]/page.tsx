import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AppError } from "@/lib/errors/app-error"
import { getSharedAnalysis } from "@/lib/shares/service"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Shared analysis",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

type PageProps = { params: Promise<{ token: string }> }

export default async function SharedAnalysisPage({ params }: PageProps) {
  const { token } = await params
  let shared: Awaited<ReturnType<typeof getSharedAnalysis>>
  try {
    shared = await getSharedAnalysis(token)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }
  return (
    <main className="min-h-screen bg-black p-4 font-mono text-xs text-zinc-200 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6 border border-zinc-700 p-5 sm:p-8">
        <header className="border-b border-white pb-5">
          <p className="text-zinc-500">+--[ PUBLIC READ-ONLY ANALYSIS ]--+</p>
          <h1 className="mt-2 text-xl font-bold uppercase text-white">{shared.title}</h1>
          <p className="mt-2 text-zinc-400">Coverage analysis; not a truth verdict or ranking.</p>
        </header>
        <section className="border border-zinc-700 p-4">
          <h2 className="font-bold text-white">DISCLAIMER / LIMITATIONS</h2>
          <p className="mt-2 leading-relaxed">{shared.disclosure.disclaimer}</p>
          <p className="mt-2">Disclaimer version: {shared.disclosure.disclaimer_version}</p>
          <a
            className="mt-2 inline-block underline"
            href={shared.disclosure.limitations_url}
            rel="noreferrer"
          >
            Read limitations
          </a>
        </section>
        <section className="border border-zinc-700 p-4">
          <h2 className="font-bold text-white">CURATION DISCLOSURE</h2>
          <p className="mt-2">
            {shared.curation_applied
              ? "Owner curation was applied."
              : "No owner curation was applied."}
          </p>
          {shared.annotations
            .filter((annotation) => annotation.finding_id === null && annotation.note)
            .map((annotation, index) => (
              <p key={`analysis-note-${index}`} className="mt-2 border-l border-white pl-3">
                OWNER NOTE: {annotation.note}
              </p>
            ))}
        </section>
        <section className="space-y-3">
          <h2 className="border-b border-zinc-700 pb-2 font-bold text-white">FINDINGS</h2>
          {shared.analysis.findings.map((finding) => {
            const notes = shared.annotations.filter((item) => item.finding_id === finding.id)
            const contests = shared.contests.filter((item) => item.finding_id === finding.id)
            return (
              <article key={finding.id} className="border border-zinc-800 p-4">
                <div className="flex flex-wrap justify-between gap-2 text-zinc-500">
                  <span>[{finding.kind.toUpperCase()}]</span>
                  <span>
                    {finding.state.toUpperCase()} / {finding.confidence_band.toUpperCase()}
                  </span>
                </div>
                <p className="mt-3 leading-relaxed text-white">{finding.text}</p>
                {notes.map((note, index) => (
                  <p
                    key={`${finding.id}-note-${index}`}
                    className="mt-3 border-l border-white pl-3"
                  >
                    OWNER NOTE: {note.note}
                  </p>
                ))}
                {contests.map((contest, index) => (
                  <p key={`${finding.id}-contest-${index}`} className="mt-3 text-zinc-400">
                    CONTEST: {contest.state.replaceAll("_", " ")}
                    {contest.reason ? ` — ${contest.reason}` : ""}
                    {contest.resolution ? ` — ${contest.resolution}` : ""}
                  </p>
                ))}
              </article>
            )
          })}
          {shared.analysis.findings.length === 0 && <p>No findings are included.</p>}
        </section>
        <footer className="border-t border-zinc-700 pt-4 text-zinc-500">
          +-- END IMMUTABLE PUBLIC PROJECTION --+
        </footer>
      </div>
    </main>
  )
}
