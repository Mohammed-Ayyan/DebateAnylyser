"use client"

import { useState } from "react"

export function ContestControl({
  findingId,
  contested,
  onRecorded,
}: {
  findingId: string
  contested: boolean
  onRecorded: (findingId: string) => void
}) {
  const [reason, setReason] = useState("")
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState("")

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus("saving")
    setError("")
    try {
      const response = await fetch(`/api/v1/findings/${encodeURIComponent(findingId)}/contests`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason } : {}),
      })
      if (!response.ok) throw new Error("The contest could not be recorded.")
      setStatus("saved")
      onRecorded(findingId)
    } catch (submitError) {
      setStatus("error")
      setError(
        submitError instanceof Error ? submitError.message : "The contest could not be recorded.",
      )
    }
  }

  if (contested || status === "saved") {
    return (
      <div
        role="status"
        className="border border-amber-900 bg-amber-950/20 p-3 text-[10px] text-amber-300"
      >
        CONTEST RECORDED · OPEN FOR REVIEW. THE ORIGINAL FINDING IS UNCHANGED.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 border border-[#262626] bg-[#080808] p-3">
      <label
        htmlFor={`contest-${findingId}`}
        className="text-[10px] font-bold uppercase text-zinc-400"
      >
        CONTEST THIS FINDING
      </label>
      <textarea
        id={`contest-${findingId}`}
        maxLength={2000}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Optional: identify the disputed context, anchor, or interpretation."
        className="min-h-20 w-full resize-y border border-[#333] bg-black p-2 font-mono text-xs text-white outline-none focus:border-white"
      />
      <div className="flex items-center justify-between gap-2">
        <span aria-live="polite" className={status === "error" ? "text-red-300" : "text-zinc-500"}>
          {error || "A contest records a review request; it does not erase or reverse the finding."}
        </span>
        <button
          type="submit"
          disabled={status === "saving"}
          className="shrink-0 border border-white bg-white px-3 py-1.5 font-bold text-black disabled:opacity-40"
        >
          {status === "saving" ? "RECORDING..." : "RECORD CONTEST"}
        </button>
      </div>
    </form>
  )
}
