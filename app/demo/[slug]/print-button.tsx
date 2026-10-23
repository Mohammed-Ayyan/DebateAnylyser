"use client"

import { Printer } from "lucide-react"

export function DemoPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Opens your browser's print dialog. Choose 'Save as PDF' to download."
      className="flex min-h-9 items-center gap-1.5 border border-[#555] bg-[#111] px-3 font-bold text-white transition-colors hover:border-white hover:bg-[#222] motion-reduce:transition-none"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
      <span>PRINT / SAVE AS PDF</span>
    </button>
  )
}
