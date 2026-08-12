import { ShieldCheck } from "lucide-react"

import { ProviderAction } from "./provider-action"

export function ProviderMessage({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  eyebrow: string
  title: string
  description: string
  actionHref: string
  actionLabel: string
}) {
  return (
    <div className="space-y-6 text-xs">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {eyebrow}
        </p>
        <h1 className="text-xl font-bold uppercase tracking-tight text-white">{title}</h1>
        <p className="max-w-[65ch] leading-relaxed text-zinc-400">{description}</p>
      </div>
      <ProviderAction href={actionHref} label={actionLabel} />
      <p className="border border-[#262626] bg-[#080808] p-3 leading-relaxed text-zinc-500">
        Credentials, account recovery, and additional verification are handled directly by the
        configured identity provider. Debate Analyser never receives your password.
      </p>
    </div>
  )
}
