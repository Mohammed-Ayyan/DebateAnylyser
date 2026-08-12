"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, HelpCircle, Menu, Search, UserRound, X } from "lucide-react"

import { NAV_ITEMS } from "./sidebar"

interface TopbarProps {
  onOpenCommandPalette: () => void
  onToggleMobileNav: () => void
  mobileNavOpen: boolean
}

const WORKSPACE_CONTEXTS: Array<[string, string]> = [
  ["/workspace", "Analysis Workspace"],
  ["/source-explorer", "Source Explorer"],
  ["/transcript-viewer", "Transcript Viewer"],
  ["/timeline", "Timeline"],
  ["/processing", "Processing"],
]

export function getPageContext(pathname: string) {
  const navItem = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  )
  const workspace = WORKSPACE_CONTEXTS.find(([prefix]) => pathname.startsWith(prefix))
  return workspace?.[1] ?? navItem?.title ?? "Workspace"
}

export function AppTopbar({ onOpenCommandPalette, onToggleMobileNav, mobileNavOpen }: TopbarProps) {
  const pathname = usePathname()
  const pageTitle = getPageContext(pathname)
  const buttonClass =
    "flex h-11 min-w-11 items-center justify-center border border-[#262626] text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-[#111] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-[#262626] bg-black/95 px-3 backdrop-blur sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          data-tour="mobile-navigation"
          className={`${buttonClass} lg:hidden`}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-xs">
          <Link href="/dashboard" className="hidden text-zinc-500 hover:text-white sm:inline">
            WORKSPACE
          </Link>
          <ChevronRight className="hidden h-3.5 w-3.5 text-zinc-700 sm:block" aria-hidden="true" />
          <span
            aria-current="page"
            className="truncate font-bold uppercase tracking-wide text-white"
          >
            {pageTitle}
          </span>
        </nav>
      </div>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden h-11 w-full max-w-sm items-center justify-between border border-[#262626] bg-[#0c0c0c] px-3 text-left text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white focus-visible:outline-2 focus-visible:outline-white md:flex"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span>Search workspace…</span>
        </span>
        <kbd className="border border-[#333] bg-black px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={`${buttonClass} md:hidden`}
          aria-label="Search workspace"
        >
          <Search className="h-4 w-4" />
        </button>
        <Link href="/help" data-tour="help-topbar" className={buttonClass} aria-label="Help">
          <HelpCircle className="h-4 w-4" />
        </Link>
        <Link
          href="/settings"
          className={`${buttonClass} gap-2 px-3`}
          aria-label="Account settings"
        >
          <UserRound className="h-4 w-4" />
          <span className="hidden xl:inline">ACCOUNT</span>
        </Link>
        <a
          href="/api/v1/auth/logout"
          className={`${buttonClass} px-3 font-bold`}
          aria-label="Log out"
          title="Log out"
        >
          <span aria-hidden="true">↪</span>
          <span className="sr-only">Log out</span>
        </a>
      </div>
    </header>
  )
}
