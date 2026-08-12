"use client"

import Link from "next/link"
import { ArrowRight, FileText, History, Keyboard, PlusCircle, Radio } from "lucide-react"

import { AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import { TourRestartButton } from "@/components/onboarding/tour-restart-button"

const guides = [
  {
    title: "Create an analysis",
    description:
      "Submit supported source material, choose retention, and follow processing status.",
    href: "/new-analysis",
    label: "OPEN NEW ANALYSIS",
    icon: PlusCircle,
  },
  {
    title: "Review previous work",
    description: "Find analyses by title or state, resume eligible runs, and open their workspace.",
    href: "/history",
    label: "OPEN HISTORY",
    icon: History,
  },
  {
    title: "Read reports",
    description:
      "Choose a completed analysis in History, then open its traceable report without scores or participant verdicts.",
    href: "/history",
    label: "CHOOSE AN ANALYSIS",
    icon: FileText,
  },
] as const

export default function HelpPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 text-xs">
        <header className="grid gap-4 border border-[#262626] bg-[#080808] p-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Help & guidance
            </p>
            <h1 className="mt-2 text-2xl font-bold uppercase text-white">
              Get oriented, then get to work
            </h1>
            <p className="mt-2 max-w-2xl leading-relaxed text-zinc-400">
              Use the short product tour for interface context, or go directly to an operational
              guide below.
            </p>
          </div>
          <TourRestartButton />
        </header>

        <section aria-labelledby="workflows-title">
          <h2
            id="workflows-title"
            className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500"
          >
            Core workflows
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {guides.map((guide) => {
              const Icon = guide.icon
              return (
                <AsciiCard key={guide.title} title={guide.title.toUpperCase()}>
                  <Icon className="mb-4 h-5 w-5 text-white" aria-hidden="true" />
                  <p className="min-h-14 leading-relaxed text-zinc-400">{guide.description}</p>
                  <Link
                    href={guide.href}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold text-white underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {guide.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </AsciiCard>
              )
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <AsciiCard title="HOW TO READ FINDINGS">
            <div className="space-y-3 leading-relaxed text-zinc-400">
              <p>
                Confidence is categorical: High, Medium, Low, or Insufficient. Missing calibration
                remains Insufficient rather than becoming a percentage.
              </p>
              <p>
                Evidence relationships apply to a specific claim and source pair. Possible fallacy
                labels remain contestable.
              </p>
              <p>
                The analysis does not declare winners, liars, participant scores, or overall debate
                quality.
              </p>
            </div>
          </AsciiCard>
          <AsciiCard title="KEYBOARD & ACCESSIBILITY">
            <div className="flex items-start gap-3">
              <Keyboard className="mt-0.5 h-5 w-5 shrink-0 text-white" aria-hidden="true" />
              <div className="space-y-3 leading-relaxed text-zinc-400">
                <p>
                  <kbd className="border border-[#444] px-1.5 py-0.5 text-white">Ctrl K</kbd> opens
                  workspace search.{" "}
                  <kbd className="border border-[#444] px-1.5 py-0.5 text-white">Esc</kbd> closes
                  the active menu, dialog, or product tour.
                </p>
                <p>
                  The product tour supports keyboard navigation and follows your reduced-motion
                  preference. It never prevents normal navigation after dismissal.
                </p>
              </div>
            </div>
          </AsciiCard>
        </div>

        <section
          className="flex flex-col gap-3 border border-[#262626] p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="live-help-title"
        >
          <div>
            <h2 id="live-help-title" className="font-bold text-white">
              Need the live workflow?
            </h2>
            <p className="mt-1 text-zinc-500">
              Open Live Debate directly; Help does not create or simulate a session.
            </p>
          </div>
          <Link
            href="/live-debate"
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-[#444] px-4 font-bold text-white hover:border-white"
          >
            <Radio className="h-4 w-4" /> OPEN LIVE DEBATE
          </Link>
        </section>
      </div>
    </AppShell>
  )
}
