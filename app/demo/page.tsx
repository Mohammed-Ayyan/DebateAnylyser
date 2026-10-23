import Link from "next/link"
import { Download, Eye, ShieldCheck } from "lucide-react"

import { DEMO_TRANSCRIPTS } from "@/lib/demo/fixtures"

export default function DemoLandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">
          Public Demo
        </h1>
        <p className="text-sm text-zinc-400">Demo Mode — Precomputed Analysis</p>
        <p className="text-xs text-zinc-500">
          Live AI processing is disabled for this demonstration. The results below were
          pre-generated from the full S0–S10 pipeline.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {DEMO_TRANSCRIPTS.map((demo) => (
          <article
            key={demo.slug}
            className="flex flex-col justify-between border border-[#262626] bg-[#080808] p-5"
          >
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase text-white">{demo.title}</h2>
              <p className="text-xs leading-relaxed text-zinc-400">{demo.description}</p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href={`/demo/${demo.slug}`}
                className="flex min-h-10 items-center justify-center gap-2 bg-white px-4 text-xs font-bold text-black hover:bg-zinc-200"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                VIEW ANALYSIS
              </Link>
              <a
                href={demo.transcriptPath}
                download
                className="flex min-h-10 items-center justify-center gap-2 border border-[#444] px-4 text-xs font-bold text-zinc-300 hover:border-white hover:text-white"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                DOWNLOAD TRANSCRIPT (.txt)
              </a>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-12 space-y-4 border border-[#262626] bg-[#050505] p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          About This Demo
        </div>
        <ul className="space-y-2 text-xs leading-relaxed text-zinc-400">
          <li>• All analysis results are precomputed and served without database access.</li>
          <li>• No external AI providers or APIs are called during the demo.</li>
          <li>• No authentication or user account is required to view these examples.</li>
          <li>
            • The full application requires sign-in for live analysis of your own transcripts.
          </li>
        </ul>
        <div className="border-t border-[#222] pt-4">
          <Link
            href="/auth/signup"
            className="inline-flex min-h-10 items-center gap-2 bg-white px-4 text-xs font-bold text-black hover:bg-zinc-200"
          >
            CREATE ACCOUNT FOR LIVE ANALYSIS
          </Link>
        </div>
      </div>
    </main>
  )
}
