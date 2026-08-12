"use client"

import React from "react"
import { Wrench } from "lucide-react"

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full border border-[#333] bg-black p-8 space-y-6 shadow-2xl">
        <div className="w-12 h-12 border border-[#444] bg-[#0c0c0c] text-white flex items-center justify-center mx-auto">
          <Wrench className="w-6 h-6" />
        </div>

        <div>
          <div className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold">
            [SERVICE UNAVAILABLE]
          </div>
          <h1 className="text-xl font-bold uppercase text-white mt-1">System Maintenance</h1>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            This service is temporarily unavailable while an operator performs maintenance. No
            restoration estimate is available from this page.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full border border-white bg-white px-4 py-2.5 text-xs font-bold text-black hover:bg-zinc-200"
        >
          RETRY
        </button>
      </div>
    </div>
  )
}
