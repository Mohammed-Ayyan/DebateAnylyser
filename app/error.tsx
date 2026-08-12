"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RefreshCw, Home, AlertTriangle } from "lucide-react"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "client.error_boundary",
        digest: error.digest ?? null,
      }),
    )
  }, [error])

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6 text-center selection:bg-white selection:text-black">
      <div className="max-w-xl w-full border border-red-950 bg-red-950/10 p-8 space-y-6 relative shadow-2xl">
        <div className="text-[10px] text-red-400 uppercase tracking-widest font-bold flex items-center justify-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          <span>[UNEXPECTED APPLICATION ERROR]</span>
        </div>

        <h1 className="text-2xl font-bold uppercase text-white tracking-tight">
          Unable to complete the request
        </h1>

        <p className="text-xs text-zinc-300 leading-relaxed max-w-md mx-auto">
          An unexpected error occurred. No incomplete or unverified result has been substituted.
        </p>

        <div className="p-3 bg-black border border-red-900 text-[10px] text-red-300 font-mono text-left overflow-x-auto">
          [REFERENCE]: {error.digest ?? "not available"}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="w-full sm:w-auto px-6 py-2.5 bg-white text-black font-bold text-xs hover:bg-zinc-200 border border-white flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>TRY AGAIN</span>
          </button>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-6 py-2.5 border border-[#333] text-zinc-300 hover:text-white text-xs flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>BACK TO DASHBOARD</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
