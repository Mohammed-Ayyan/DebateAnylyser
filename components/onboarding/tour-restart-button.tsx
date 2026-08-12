"use client"

import { Compass } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { TOUR_RESTART_KEY, TOUR_SKIP_KEY } from "@/lib/onboarding/tour-state"
import { cn } from "@/lib/utils"

export const TOUR_RESTART_EVENT = "debate-analyser:restart-tour"

export function requestProductTour() {
  try {
    window.sessionStorage.setItem(TOUR_RESTART_KEY, "true")
  } catch {
    // The in-page event still works when storage is unavailable.
  }
  window.dispatchEvent(new Event(TOUR_RESTART_EVENT))
}

export function requestProductTourSkip() {
  try {
    window.sessionStorage.setItem(TOUR_SKIP_KEY, "true")
  } catch {
    // A storage-restricted browser may show the optional tour again.
  }
}

export function TourRestartButton({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const restart = () => {
    requestProductTour()
    if (pathname !== "/dashboard") router.push("/dashboard")
  }

  return (
    <button
      type="button"
      onClick={restart}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 border border-white bg-white px-4 py-2 font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        className,
      )}
    >
      <Compass className="h-4 w-4" aria-hidden="true" />
      START PRODUCT TOUR
    </button>
  )
}
