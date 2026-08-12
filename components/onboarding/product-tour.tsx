"use client"

import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { driver, type DriveStep, type Driver } from "driver.js"

import { TOUR_RESTART_EVENT } from "@/components/onboarding/tour-restart-button"
import {
  consumeRestartRequest,
  consumeSkipRequest,
  createTourScope,
  readTourRecord,
  shouldStartTour,
  type TourStatus,
  writeTourRecord,
} from "@/lib/onboarding/tour-state"
import { requiredTourSelectors, waitForTourTargets } from "@/lib/onboarding/tour-dom"

type MeResponse = { user?: { email?: string } }
type HistoryResponse = { items?: unknown[] }

function hasOpenDialog() {
  return Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]'))
}

function stepsForViewport(isMobile: boolean): DriveStep[] {
  if (isMobile) {
    const navigationConcept = (title: string, description: string): DriveStep => ({
      element: '[data-tour="mobile-navigation"]',
      popover: { title, description },
    })
    return [
      {
        element: '[data-tour="dashboard-overview"]',
        popover: {
          title: "Your command center",
          description: "Start work, check active runs, and return to recent analyses from here.",
        },
      },
      {
        element: '[data-tour="dashboard-actions"]',
        popover: {
          title: "Start an analysis",
          description: "Choose an authorized upload, pasted transcript, or approved HTTPS URL.",
        },
      },
      navigationConcept(
        "Analysis workspace",
        "Use the navigation menu to open transcript-grounded findings and their anchored context.",
      ),
      navigationConcept(
        "Evidence and sources",
        "Evidence views keep each external source relationship attached to a specific claim.",
      ),
      navigationConcept(
        "Reports",
        "Reports present traceable findings and limitations without scores or participant verdicts.",
      ),
      navigationConcept(
        "History",
        "History lets you resume processing and reopen retained analyses.",
      ),
      navigationConcept(
        "Settings and profile",
        "Settings controls reading preferences, retention, privacy actions, and tour restart.",
      ),
      {
        element: '[data-tour="recent-work"]',
        popover: {
          title: "Resume real work",
          description: "Recent analyses appear here with their current processing state.",
        },
      },
      {
        element: '[data-tour="help-topbar"]',
        popover: {
          title: "Help is always available",
          description: "Open Help for operational guidance or to run this tour again.",
        },
      },
    ]
  }

  return [
    {
      element: '[data-tour="dashboard-overview"]',
      popover: {
        title: "Your command center",
        description: "Start work, check active runs, and return to recent analyses from here.",
      },
    },
    {
      element: '[data-tour="nav-new-analysis"]',
      popover: {
        title: "Start with source material",
        description: "Create an analysis from an authorized upload, paste, or approved HTTPS URL.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-live-debate"]',
      popover: {
        title: "Live debate readiness",
        description:
          "Check device readiness here. Session controls remain unavailable until a real live backend is connected.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-history"]',
      popover: {
        title: "Analysis workspace",
        description:
          "Choose a retained analysis in History to open its transcript-grounded workspace.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-history"]',
      popover: {
        title: "Evidence and sources",
        description: "Workspace evidence views keep external sources attached to specific claims.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-history"]',
      popover: {
        title: "Reports",
        description:
          "Choose a completed analysis in History to read or export its traceable report.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-history"]',
      popover: {
        title: "History",
        description: "Resume processing and reopen retained analyses from your library.",
        side: "right",
      },
    },
    {
      element: '[data-tour="nav-settings"]',
      popover: {
        title: "Settings and profile",
        description: "Manage reading preferences, retention, privacy actions, and tour restart.",
        side: "right",
      },
    },
    {
      element: '[data-tour="recent-work"]',
      popover: {
        title: "Resume real work",
        description: "Recent analyses appear here with their current processing state.",
      },
    },
    {
      element: '[data-tour="nav-help"]',
      popover: {
        title: "Help is always available",
        description: "Open Help for operational guidance or to run this tour again.",
        side: "right",
      },
    },
  ]
}

export function ProductTour({ blocked }: { blocked: boolean }) {
  const pathname = usePathname()
  const instanceRef = useRef<Driver | null>(null)
  const scopeRef = useRef("browser")
  const outcomeRef = useRef<TourStatus | null>(null)
  const queuedRef = useRef(false)
  const programmaticDestroyRef = useRef(false)
  const waitControllerRef = useRef<AbortController | null>(null)
  const pathnameRef = useRef(pathname)
  const blockedRef = useRef(blocked)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    blockedRef.current = blocked
  }, [blocked])

  const start = useCallback(async () => {
    if (pathnameRef.current !== "/dashboard" || blockedRef.current || hasOpenDialog()) {
      queuedRef.current = true
      return
    }
    const steps = stepsForViewport(window.matchMedia("(max-width: 1023px)").matches)
    waitControllerRef.current?.abort()
    const waitController = new AbortController()
    waitControllerRef.current = waitController
    const ready = await waitForTourTargets(requiredTourSelectors(steps), waitController.signal)
    if (!ready || pathnameRef.current !== "/dashboard" || blockedRef.current || hasOpenDialog()) {
      queuedRef.current = true
      return
    }

    if (instanceRef.current) {
      programmaticDestroyRef.current = true
      instanceRef.current.destroy()
    }
    outcomeRef.current = null
    programmaticDestroyRef.current = false
    queuedRef.current = false
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const tour = driver({
      steps,
      animate: !reducedMotion,
      smoothScroll: !reducedMotion,
      allowClose: true,
      allowKeyboardControl: true,
      allowScroll: true,
      overlayClickBehavior: "close",
      showProgress: true,
      showButtons: ["previous", "next", "close"],
      progressText: "Step {{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      popoverClass: "debate-product-tour",
      stagePadding: 8,
      stageRadius: 0,
      onPopoverRender: (popover) => {
        popover.closeButton.textContent = "Skip"
        popover.closeButton.setAttribute("aria-label", "Skip product tour")
      },
      onCloseClick: (_element, _step, { driver: current }) => {
        outcomeRef.current = "dismissed"
        current.destroy()
      },
      onDoneClick: (_element, _step, { driver: current }) => {
        outcomeRef.current = "completed"
        current.destroy()
      },
      onDestroyed: () => {
        const status = outcomeRef.current ?? (programmaticDestroyRef.current ? null : "dismissed")
        if (status) writeTourRecord(window.localStorage, scopeRef.current, status)
        outcomeRef.current = null
        programmaticDestroyRef.current = false
        instanceRef.current = null
      },
    })
    instanceRef.current = tour
    tour.drive()
  }, [])

  useEffect(() => {
    if (pathname !== "/dashboard") return
    const controller = new AbortController()
    const initialize = async () => {
      let requestsConsumed = false
      let manuallyRequested = false
      let skipRequested = false
      const consumeRequests = () => {
        if (requestsConsumed) return
        manuallyRequested = consumeRestartRequest(window.sessionStorage)
        skipRequested = consumeSkipRequest(window.sessionStorage)
        requestsConsumed = true
      }
      try {
        const [meResponse, historyResponse] = await Promise.all([
          fetch("/api/v1/me", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/v1/analyses?limit=1", {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }),
        ])
        if (controller.signal.aborted) return
        consumeRequests()
        let identity: string | undefined
        if (meResponse.ok) {
          const me = (await meResponse.json()) as MeResponse
          identity = me.user?.email
        }
        scopeRef.current = createTourScope(identity)
        if (skipRequested) {
          writeTourRecord(window.localStorage, scopeRef.current, "dismissed")
          return
        }
        const history = historyResponse.ok
          ? ((await historyResponse.json()) as HistoryResponse)
          : null
        if (
          shouldStartTour({
            record: readTourRecord(window.localStorage, scopeRef.current),
            historyKnown: history !== null,
            hasAnalyses: Boolean(history?.items?.length),
            manuallyRequested,
          })
        ) {
          await start()
        }
      } catch {
        if (controller.signal.aborted) return
        consumeRequests()
        if (skipRequested) {
          writeTourRecord(window.localStorage, scopeRef.current, "dismissed")
        } else if (manuallyRequested) {
          await start()
        }
      }
    }
    void initialize()
    return () => {
      controller.abort()
      waitControllerRef.current?.abort()
      if (instanceRef.current) {
        programmaticDestroyRef.current = true
        instanceRef.current.destroy()
      }
    }
  }, [pathname, start])

  useEffect(() => {
    const restart = () => {
      if (pathnameRef.current !== "/dashboard") return
      consumeRestartRequest(window.sessionStorage)
      void start()
    }
    window.addEventListener(TOUR_RESTART_EVENT, restart)
    return () => window.removeEventListener(TOUR_RESTART_EVENT, restart)
  }, [start])

  useEffect(() => {
    if (blocked && instanceRef.current?.isActive()) {
      queuedRef.current = true
      programmaticDestroyRef.current = true
      instanceRef.current.destroy()
    } else if (!blocked && queuedRef.current) {
      void start()
    }
  }, [blocked, start])

  return null
}
