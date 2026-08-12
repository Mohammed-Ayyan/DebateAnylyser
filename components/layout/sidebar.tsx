"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HelpCircle,
  History,
  LayoutDashboard,
  MessageSquareReply,
  PlusCircle,
  Radio,
  Settings,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"

export const NAV_ITEMS = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, tour: "nav-dashboard" },
  { title: "New Analysis", href: "/new-analysis", icon: PlusCircle, tour: "nav-new-analysis" },
  { title: "Live Debate", href: "/live-debate", icon: Radio, tour: "nav-live-debate" },
  { title: "History", href: "/history", icon: History, tour: "nav-history" },
  { title: "Feedback", href: "/feedback", icon: MessageSquareReply, tour: "nav-feedback" },
  { title: "Educator", href: "/educator", icon: GraduationCap, tour: "nav-educator" },
  { title: "Settings", href: "/settings", icon: Settings, tour: "nav-settings" },
  { title: "Help", href: "/help", icon: HelpCircle, tour: "nav-help" },
] as const

type SidebarProps = {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
  onToggleCollapsed: () => void
}

export function AppSidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname()
  const sidebarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!mobileOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const sidebar = sidebarRef.current
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    focusable()[0]?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", trapFocus)
    return () => {
      document.removeEventListener("keydown", trapFocus)
      previous?.focus()
    }
  }, [mobileOpen])

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/80 lg:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        ref={sidebarRef}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Primary navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-col border-r border-[#262626] bg-black text-xs transition-transform duration-200 lg:sticky lg:top-0 lg:z-30 lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-20" : "lg:w-64",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[#262626] px-3">
          <Link
            href="/dashboard"
            className="flex min-h-11 items-center gap-2 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-white font-bold text-black">
              DBT
            </span>
            <span className={cn("min-w-0", collapsed && "lg:sr-only")}>
              <span className="block truncate text-sm font-bold tracking-wide">
                DEBATE ANALYSER
              </span>
              <span className="block text-[9px] tracking-wider text-zinc-500">
                EVIDENCE OVER OPINION
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-11 w-11 items-center justify-center text-zinc-400 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-[#262626] p-3">
          <Link
            href="/new-analysis"
            data-tour="sidebar-primary-action"
            className="flex min-h-11 items-center justify-center gap-2 bg-white px-3 font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            title={collapsed ? "New Analysis" : undefined}
          >
            <PlusCircle className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "lg:sr-only")}>NEW ANALYSIS</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label="Workspace">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tour}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.title : undefined}
                className={cn(
                  "group flex min-h-11 items-center gap-3 border px-3 transition-colors focus-visible:outline-2 focus-visible:outline-white",
                  active
                    ? "border-[#444] bg-[#151515] font-bold text-white"
                    : "border-transparent text-zinc-400 hover:border-[#2b2b2b] hover:bg-[#0c0c0c] hover:text-white",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "w-2 text-[9px]",
                    active ? "text-white" : "text-transparent",
                    collapsed && "lg:hidden",
                  )}
                >
                  ▶
                </span>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className={cn("truncate", collapsed && "lg:sr-only")}>{item.title}</span>
              </Link>
            )
          })}
        </nav>

        <div className="hidden border-t border-[#262626] p-2 lg:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className="flex min-h-11 w-full items-center justify-center gap-2 text-zinc-500 transition-colors hover:bg-[#0c0c0c] hover:text-white focus-visible:outline-2 focus-visible:outline-white"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            <span className={cn(collapsed && "sr-only")}>COLLAPSE NAVIGATION</span>
          </button>
        </div>
      </aside>
    </>
  )
}
