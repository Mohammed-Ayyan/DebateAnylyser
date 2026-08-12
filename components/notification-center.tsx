"use client"

import { Bell, X } from "lucide-react"
import { useEffect, useRef } from "react"

import { AnalysisState } from "@/components/analysis-state"

interface NotificationCenterProps {
  open: boolean
  onClose: () => void
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 font-mono text-xs backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="flex h-full w-full max-w-md flex-col border-l border-[#262626] bg-black shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      >
        <header className="flex min-h-16 items-center justify-between border-b border-[#262626] bg-[#080808] px-4">
          <div className="flex items-center gap-2 text-white">
            <Bell className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            <div>
              <h2 id="notification-center-title" className="font-bold uppercase tracking-wider">
                System Notifications
              </h2>
              <p className="mt-0.5 text-[10px] font-normal text-zinc-500">0 unread</p>
            </div>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center border border-transparent text-zinc-400 hover:border-[#444] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Close notification center"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 p-4">
          <AnalysisState
            kind="empty"
            title="Notification log is empty"
            description="No notification API is connected, so this panel does not display generated alerts. Analysis status remains available in History and the processing view."
            className="mt-4"
          />
        </div>

        <footer className="border-t border-[#262626] bg-[#080808] p-4 text-[10px] leading-relaxed text-zinc-500">
          REAL EVENTS ONLY · THIS PANEL WILL REMAIN EMPTY UNTIL BACKED BY A NOTIFICATION SERVICE
        </footer>
      </section>
    </div>
  )
}
