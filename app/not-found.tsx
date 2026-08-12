"use client"

import React from "react"
import Link from "next/link"
import { ArrowLeft, Home, Terminal } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6 text-center selection:bg-white selection:text-black">
      <div className="max-w-xl w-full border border-[#333] p-8 space-y-6 bg-black relative shadow-2xl">
        {/* Corner Plus Signs */}
        <span className="absolute -top-[1px] -left-[1px] text-[10px] text-zinc-600 select-none">
          +
        </span>
        <span className="absolute -top-[1px] -right-[1px] text-[10px] text-zinc-600 select-none">
          +
        </span>
        <span className="absolute -bottom-[1px] -left-[1px] text-[10px] text-zinc-600 select-none">
          +
        </span>
        <span className="absolute -bottom-[1px] -right-[1px] text-[10px] text-zinc-600 select-none">
          +
        </span>

        <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
          [ERROR CODE 404]
        </div>

        {/* ASCII Art 404 */}
        <pre className="text-zinc-500 font-mono text-[10px] leading-none select-none hidden sm:block">
          {`
   █████╗  ██████╗  █████╗ 
  ██╔══██╗██╔═══██╗██╔══██╗
  ███████║██║   ██║███████║
  ██╔══██║██║   ██║██╔══██║
  ██║  ██║╚██████╔╝██║  ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝
          `}
        </pre>

        <h1 className="text-2xl font-bold uppercase text-white tracking-tight">
          Page Not Found In Corpus
        </h1>

        <p className="text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
          The debate transcript, route, or resource path you requested does not exist or has been
          archived under another index ID.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-6 py-2.5 bg-white text-black font-bold text-xs hover:bg-zinc-200 border border-white flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>RETURN TO DASHBOARD</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
