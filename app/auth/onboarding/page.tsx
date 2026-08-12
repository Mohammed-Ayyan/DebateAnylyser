"use client"

import { ArrowRight, Compass } from "lucide-react"
import { useRouter } from "next/navigation"

import {
  requestProductTour,
  requestProductTourSkip,
} from "@/components/onboarding/tour-restart-button"

export default function OnboardingPage() {
  const router = useRouter()

  const continueToTour = () => {
    requestProductTour()
    router.replace("/dashboard")
  }

  return (
    <div className="space-y-6 text-xs">
      <div className="flex h-11 w-11 items-center justify-center border border-white bg-white text-black">
        <Compass className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
          Quick orientation
        </p>
        <h1 className="mt-2 text-2xl font-bold uppercase text-white">
          Learn the workspace in context
        </h1>
        <p className="mt-3 leading-relaxed text-zinc-400">
          There is no setup questionnaire. A short product tour will point out where to start an
          analysis, open live debate, resume work, and find Help.
        </p>
      </div>
      <div className="border-l-2 border-white bg-[#080808] p-4 text-zinc-300">
        The tour is optional, can be skipped at any time, and can be restarted from Help or
        Settings.
      </div>
      <button
        type="button"
        onClick={continueToTour}
        className="flex min-h-12 w-full items-center justify-center gap-2 border border-white bg-white px-4 font-bold text-black transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        OPEN DASHBOARD & START TOUR <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          requestProductTourSkip()
          router.replace("/dashboard")
        }}
        className="min-h-11 w-full border border-[#333] px-4 font-bold text-zinc-300 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-white"
      >
        SKIP TOUR
      </button>
    </div>
  )
}
