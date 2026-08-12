import type { LucideIcon } from "lucide-react"
import { AlertTriangle, Inbox, LoaderCircle, WifiOff } from "lucide-react"
import type { ReactNode } from "react"

const icons = {
  loading: LoaderCircle,
  empty: Inbox,
  error: AlertTriangle,
  unavailable: WifiOff,
} satisfies Record<string, LucideIcon>

type AnalysisStateProps = {
  kind: keyof typeof icons
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function AnalysisState({
  kind,
  title,
  description,
  action,
  className = "",
}: AnalysisStateProps) {
  const Icon = icons[kind]
  return (
    <section
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" || undefined}
      className={`border border-[#2a2a2a] bg-[#080808] p-5 font-mono ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden="true"
          className={`mt-0.5 h-4 w-4 shrink-0 text-zinc-400 ${
            kind === "loading" ? "motion-safe:animate-spin" : ""
          }`}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-white">{title}</h2>
          <p className="mt-1 max-w-[70ch] text-[11px] leading-relaxed text-zinc-400">
            {description}
          </p>
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </section>
  )
}
