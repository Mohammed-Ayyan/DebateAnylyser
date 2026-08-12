"use client"

import React from "react"
import Link from "next/link"
import { Lock, ShieldAlert, ArrowLeft } from "lucide-react"

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full border border-red-950 bg-black p-8 space-y-6 shadow-2xl">
        <div className="w-12 h-12 border border-red-800 bg-red-950/30 text-red-400 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>

        <div>
          <div className="text-[10px] text-red-400 uppercase tracking-widest font-bold">
            [ACCESS DENIED - 403]
          </div>
          <h1 className="text-xl font-bold uppercase text-white mt-1">
            Restricted Discourse Workspace
          </h1>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            You do not possess the required clearance tier or admin token to view this debate
            session dataset.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-white text-black font-bold text-xs hover:bg-zinc-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>RETURN TO DASHBOARD</span>
        </Link>
      </div>
    </div>
  )
}
