import type { Metadata } from "next"

import { AsciiBadge } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import { getServerLegalPolicy, isLegalPolicyActive } from "@/lib/legal/server-policy"
import { ConsentControl } from "./consent-control"

export const metadata: Metadata = {
  title: "Legal, Terms & Acceptable Use | Debate Analyser",
  description: "Terms, acceptable-use rules, rights requirements, privacy notice, and disclaimers.",
}

export const dynamic = "force-dynamic"

const sections = [
  {
    id: "terms",
    title: "Terms and purpose",
    body: [
      "Debate Analyser is an educational analysis aid. It examines arguments and statements; it does not determine who won, declare absolute truth, or issue verdicts about people.",
      "You are responsible for ensuring that your submission and intended use are lawful and authorized. The service may refuse material when rights, access, or platform restrictions cannot be established.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "Use the service for education, research, journalism, or personal review of arguments. Do not use it to harass, intimidate, target, or damage the reputation of a person.",
      "Do not use the service to optimize covert persuasion, manufacture a claim that someone is a liar or inherently fallacious, evade access controls, or process unlawful or infringing material.",
    ],
  },
  {
    id: "rights",
    title: "Content rights and platform restrictions",
    body: [
      "Submit only material you own, have permission or a license to use, or that is in the public domain. Public availability alone does not establish permission.",
      "Private, blocked, restricted, local-network, and unapproved URL sources are refused. Platforms that require official APIs or caption access must use those approved methods; scraping or restriction bypass is not permitted.",
    ],
  },
]

export default function LegalPage() {
  const policy = getServerLegalPolicy()
  const active = isLegalPolicyActive(policy)
  const status = policy.counselApproved
    ? "APPROVED"
    : policy.developmentTestMode
      ? "DEVELOPMENT TEST MODE"
      : "DRAFT / INACTIVE"

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 font-mono text-xs">
        <header className="border border-[#262626] bg-[#080808] p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                [TERMS / ACCEPTABLE USE / RIGHTS / PRIVACY]
              </p>
              <h1 className="mt-2 text-xl font-bold uppercase text-white sm:text-2xl">
                Legal and acceptable-use policy
              </h1>
              <p className="mt-3 max-w-[70ch] leading-relaxed text-zinc-300">
                Review these rules before submitting any recording, transcript, file, or URL.
              </p>
            </div>
            <AsciiBadge variant={active ? "success" : "warning"}>{status}</AsciiBadge>
          </div>
        </header>

        <section aria-labelledby="policy-status" className="border border-[#262626] bg-black p-4">
          <h2 id="policy-status" className="font-bold uppercase text-white">
            Policy status
          </h2>
          <dl className="mt-3 grid gap-3 text-zinc-300 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Version</dt>
              <dd className="mt-1 break-all text-white">{policy.version ?? "UNCONFIGURED"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Activation</dt>
              <dd className="mt-1 text-white">{status}</dd>
            </div>
          </dl>
          {policy.developmentTestMode && (
            <p className="mt-4 border border-cyan-800/60 bg-cyan-950/30 p-3 leading-relaxed text-cyan-200">
              Local development test mode is active. This permits isolated testing only and does not
              represent legal counsel approval or authorize production use.
            </p>
          )}
          {!active && (
            <p className="mt-4 border border-amber-800/60 bg-amber-950/30 p-3 leading-relaxed text-amber-200">
              This policy is published as an implementation draft. It cannot be accepted, and
              analysis remains disabled, until counsel approves the exact version shown here.
            </p>
          )}
          <ConsentControl active={active} version={policy.version} />
        </section>
        <article className="divide-y divide-[#262626] border border-[#262626] bg-black">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="p-4 sm:p-6">
              <h2 className="text-sm font-bold uppercase text-white">{section.title}</h2>
              <div className="mt-3 max-w-[72ch] space-y-3 leading-relaxed text-zinc-300">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section id="privacy" className="p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase text-white">Privacy and third-party data</h2>
            <div className="mt-3 max-w-[72ch] space-y-3 leading-relaxed text-zinc-300">
              <p>
                Recordings, voices, names, and transcripts may contain personal or sensitive data.
                Do not submit another person&apos;s material unless you have an appropriate lawful
                and authorized basis to do so.
              </p>
              <p>
                Data minimization, configured retention, and deletion controls apply to processed
                material. Avoid submitting information that is unnecessary for argument analysis.
              </p>
            </div>
          </section>

          <section id="disclaimer" className="p-4 sm:p-6">
            <h2 className="text-sm font-bold uppercase text-white">Analysis disclaimer</h2>
            <div className="mt-3 max-w-[72ch] space-y-3 leading-relaxed text-zinc-300">
              <p>
                Automated analysis can be incomplete or wrong. Findings are educational signals, not
                legal, medical, professional, or authoritative fact-checking advice.
              </p>
              <p>
                Verify important conclusions against the cited source material. Insufficient,
                contested, and uncertain results are not failures and must not be presented as
                verdicts about a person.
              </p>
            </div>
          </section>
        </article>

        <footer className="border-t border-[#262626] py-4 text-[10px] leading-relaxed text-zinc-500">
          Acceptance is recorded against the exact policy version. A changed version requires a new
          acknowledgement before another analysis can begin.
        </footer>
      </main>
    </AppShell>
  )
}
