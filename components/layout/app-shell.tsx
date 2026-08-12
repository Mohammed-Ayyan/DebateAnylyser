"use client"

import React, { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { CommandPalette } from "@/components/command-palette"
import { ProductTour } from "@/components/onboarding/product-tour"
import { AppSidebar } from "./sidebar"
import { AppTopbar, getPageContext } from "./topbar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [preferences, setPreferences] = useState({
    readingDensity: "comfortable" as "comfortable" | "low_density",
    reducedMotion: false,
  })
  const [commandOpen, setCommandOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => setMobileNavOpen(false), [pathname])

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/v1/me", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as {
          preferences?: {
            reading_density?: "comfortable" | "low_density"
            accessibility_prefs?: { reduced_motion?: boolean }
          }
        }
        setPreferences({
          readingDensity: body.preferences?.reading_density ?? "comfortable",
          reducedMotion: body.preferences?.accessibility_prefs?.reduced_motion ?? false,
        })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const dialogOpen = commandOpen || mobileNavOpen
  const pageContext = getPageContext(pathname)

  return (
    <div
      data-density={preferences.readingDensity}
      data-reduced-motion={preferences.reducedMotion ? "true" : "false"}
      className="flex min-h-dvh bg-black font-mono text-white selection:bg-white selection:text-black"
    >
      <a
        href="#main-content"
        className="no-print fixed left-3 top-3 z-[10000] -translate-y-20 bg-white px-3 py-2 font-bold text-black focus:translate-y-0"
      >
        SKIP TO CONTENT
      </a>
      <AppSidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          onOpenCommandPalette={() => setCommandOpen(true)}
          onToggleMobileNav={() => setMobileNavOpen((value) => !value)}
          mobileNavOpen={mobileNavOpen}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6"
        >
          {children}
        </main>
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {pageContext} loaded
      </div>
      <div data-print-hidden="true">
        <ProductTour blocked={dialogOpen} />
        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      </div>
    </div>
  )
}
