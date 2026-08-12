"use client"

import { useEffect, useState } from "react"

import type { Annotation } from "@/lib/annotations/contracts"

export function AnnotationControls({
  analysisId,
  findingId,
  annotation,
  onChanged,
}: {
  analysisId: string
  findingId: string
  annotation?: Annotation
  onChanged: (annotation: Annotation | null) => void
}) {
  const [note, setNote] = useState(annotation?.note ?? "")
  const [visibility, setVisibility] = useState<"shown" | "hidden">(
    annotation?.visibility ?? "shown",
  )
  const [highlighted, setHighlighted] = useState(annotation?.highlighted ?? false)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState("")

  useEffect(() => {
    setNote(annotation?.note ?? "")
    setVisibility(annotation?.visibility ?? "shown")
    setHighlighted(annotation?.highlighted ?? false)
    setStatus("idle")
    setError("")
  }, [annotation, findingId])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!note.trim() && visibility === "shown" && !highlighted) {
      setStatus("error")
      setError("Add a note, hide the finding, or highlight it before saving.")
      return
    }
    setStatus("saving")
    setError("")
    const url = annotation
      ? `/api/v1/annotations/${encodeURIComponent(annotation.id)}`
      : `/api/v1/analyses/${encodeURIComponent(analysisId)}/annotations`
    const body = {
      ...(annotation ? {} : { finding_id: findingId }),
      note: note.trim() || null,
      visibility,
      highlighted,
    }
    try {
      const response = await fetch(url, {
        method: annotation ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error("The annotation could not be saved.")
      const saved = (await response.json()) as Annotation
      onChanged(saved)
      setStatus("saved")
    } catch (saveError) {
      setStatus("error")
      setError(
        saveError instanceof Error ? saveError.message : "The annotation could not be saved.",
      )
    }
  }

  const remove = async () => {
    if (!annotation) return
    setStatus("saving")
    setError("")
    try {
      const response = await fetch(`/api/v1/annotations/${encodeURIComponent(annotation.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (!response.ok) throw new Error("The annotation could not be deleted.")
      onChanged(null)
      setNote("")
      setVisibility("shown")
      setHighlighted(false)
      setStatus("saved")
    } catch (deleteError) {
      setStatus("error")
      setError(
        deleteError instanceof Error ? deleteError.message : "The annotation could not be deleted.",
      )
    }
  }

  return (
    <form onSubmit={save} className="flex h-full flex-col space-y-3">
      <label
        htmlFor={`annotation-${findingId}`}
        className="text-[10px] font-bold uppercase text-zinc-400"
      >
        EDUCATOR NOTE / QUESTION
      </label>
      <textarea
        id={`annotation-${findingId}`}
        maxLength={4000}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="min-h-[180px] w-full flex-1 resize-y border border-[#262626] bg-[#080808] p-3 font-mono text-xs text-white outline-none focus:border-white"
        placeholder="Add context or a question for the curated presentation."
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 border border-[#262626] bg-[#080808] p-2 text-zinc-300">
          <input
            type="checkbox"
            checked={highlighted}
            onChange={(event) => setHighlighted(event.target.checked)}
          />
          <span>Highlight</span>
        </label>
        <label className="flex items-center gap-2 border border-[#262626] bg-[#080808] p-2 text-zinc-300">
          <input
            type="checkbox"
            checked={visibility === "hidden"}
            onChange={(event) => setVisibility(event.target.checked ? "hidden" : "shown")}
          />
          <span>Hide in curated views</span>
        </label>
      </div>
      <p className="text-[10px] text-zinc-500">
        Curation never changes or deletes the underlying finding. Shared/exported views will
        disclose applied curation.
      </p>
      <div
        aria-live="polite"
        className={status === "error" ? "text-[10px] text-red-300" : "text-[10px] text-emerald-400"}
      >
        {error || (status === "saved" ? "ANNOTATION SAVED" : "")}
      </div>
      <div className="flex justify-end gap-2">
        {annotation && (
          <button
            type="button"
            onClick={remove}
            disabled={status === "saving"}
            className="border border-[#333] px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          >
            DELETE NOTE
          </button>
        )}
        <button
          type="submit"
          disabled={status === "saving"}
          className="border border-white bg-white px-3 py-1.5 font-bold text-black disabled:opacity-40"
        >
          {status === "saving" ? "SAVING..." : "SAVE CURATION"}
        </button>
      </div>
    </form>
  )
}
