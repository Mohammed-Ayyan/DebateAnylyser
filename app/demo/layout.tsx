import Link from "next/link"

export const metadata = {
  title: "Demo Mode | Debate Analyser",
  description: "Explore precomputed debate analysis examples without authentication.",
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-black font-mono text-white selection:bg-white selection:text-black">
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[#262626] bg-black/95 px-4 sm:px-6">
        <Link href="/demo" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-white text-sm font-bold text-black">
            DBT
          </span>
          <span>
            <strong className="block text-sm tracking-wider">DEBATE ANALYSER</strong>
            <small className="text-[9px] tracking-widest text-zinc-500">
              EVIDENCE OVER OPINION
            </small>
          </span>
        </Link>
        <div className="flex items-center gap-3 text-xs">
          <span className="border border-emerald-700 bg-emerald-950/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            DEMO MODE
          </span>
          <Link
            href="/demo"
            className="hidden min-h-9 items-center border border-[#333] px-3 py-1.5 text-zinc-300 hover:border-white hover:text-white sm:flex"
          >
            DEMO MENU
          </Link>
          <Link
            href="/"
            className="min-h-9 border border-[#333] px-3 py-1.5 text-zinc-300 hover:border-white hover:text-white"
          >
            HOME
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-[#262626] px-5 py-6 text-[10px] text-zinc-500">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4">
          <span>DEBATE ANALYSER · DEMO MODE · PRECOMPUTED ANALYSIS</span>
          <nav aria-label="Demo footer links" className="flex gap-4">
            <Link href="/" className="hover:text-white">
              MAIN SITE
            </Link>
            <Link href="/auth/signin" className="hover:text-white">
              SIGN IN
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
