"use client"

import { ArrowRight, LoaderCircle } from "lucide-react"
import { useState } from "react"

export function ProviderAction({ href, label }: { href: string; label: string }) {
  const [loading, setLoading] = useState(false)
  return (
    <a
      href={href}
      aria-disabled={loading}
      onClick={() => setLoading(true)}
      className="flex min-h-12 w-full items-center justify-center gap-2 border border-white bg-white px-4 font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-disabled:pointer-events-none aria-disabled:opacity-70"
    >
      {loading ? (
        <LoaderCircle
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{loading ? "CONNECTING TO AUTH0…" : label}</span>
    </a>
  )
}
