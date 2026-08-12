"use client"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-white font-mono flex items-center justify-center p-6 text-center">
        <main className="max-w-xl w-full border border-red-950 bg-red-950/10 p-8 space-y-6">
          <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold">
            [UNEXPECTED APPLICATION ERROR]
          </p>
          <h1 className="text-2xl font-bold uppercase tracking-tight">Unable to continue</h1>
          <p className="text-xs text-zinc-300 leading-relaxed">
            The application encountered an unexpected error. No incomplete result has been
            substituted.
          </p>
          <button
            type="button"
            onClick={reset}
            className="px-6 py-2.5 bg-white text-black font-bold text-xs hover:bg-zinc-200 border border-white"
          >
            TRY AGAIN
          </button>
        </main>
      </body>
    </html>
  )
}
