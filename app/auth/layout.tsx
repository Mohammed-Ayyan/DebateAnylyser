"use client"

import React from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col justify-between p-4 selection:bg-white selection:text-black">
      {/* Top Header */}
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full py-4 border-b border-[#262626]">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 bg-white text-black font-bold flex items-center justify-center text-xs group-hover:bg-zinc-200">
            DBT
          </div>
          <span className="font-bold text-white text-sm tracking-wider">DEBATE ANALYSER V2</span>
        </Link>

        <div className="flex items-center gap-2 border border-[#222] px-2.5 py-1 text-[10px] text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
          <span>OIDC SECURE SIGN-IN</span>
        </div>
      </header>

      {/* Main Form Box */}
      <main className="flex-1 flex items-center justify-center py-10">
        <div className="w-full max-w-md bg-black border border-[#333] p-6 sm:p-8 shadow-2xl relative">
          {/* ASCII Corner Plus Signs */}
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

          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-zinc-600 py-4 border-t border-[#1f1f1f] max-w-5xl mx-auto w-full flex justify-between">
        <span>© 2026 DEBATE ANALYSER</span>
        <span>EVIDENCE OVER OPINION</span>
      </footer>
    </div>
  )
}
