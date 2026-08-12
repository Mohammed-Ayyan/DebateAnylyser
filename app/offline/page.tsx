"use client"

import React from "react"
import Link from "next/link"
import { WifiOff, RefreshCw } from "lucide-react"

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full border border-[#333] bg-[#050505] p-8 space-y-6 shadow-2xl">
        <div className="w-12 h-12 border border-[#444] bg-black text-zinc-400 flex items-center justify-center mx-auto">
          <WifiOff className="w-6 h-6" />
        </div>

        <div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            [CONNECTION LOSS]
          </div>
          <h1 className="text-xl font-bold uppercase text-white mt-1">Network Disconnected</h1>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            Processing updates, external evidence retrieval, and saved workspace data require an
            active connection. Check your network, then retry.
          </p>
        </div>

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-white text-black font-bold text-xs hover:bg-zinc-200"
        >
          <RefreshCw className="w-4 h-4" />
          <span>RETRY CONNECTION</span>
        </button>
      </div>
    </div>
  )
}
