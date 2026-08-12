"use client"

import { useState, type FormEvent } from "react"

export function DevelopmentSessionAction({ action }: { action: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError("")
    try {
      const response = await fetch(action, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      })
      if (!response.ok) throw new Error("The development session could not be created.")
      window.location.assign(response.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development sign-in failed.")
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-2 border border-amber-900 bg-amber-950/20 p-3"
    >
      <p className="font-bold uppercase text-amber-200">Development-only local session</p>
      <p className="leading-relaxed text-amber-100/80">
        Uses one fixed local identity through normal provisioning and signed-session validation. It
        accepts no credentials and is unavailable in staging or production.
      </p>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full border border-amber-300 px-3 font-bold text-amber-100 hover:bg-amber-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "CREATING DEVELOPMENT SESSION…" : "CONTINUE AS FIXED DEVELOPMENT USER"}
      </button>
    </form>
  )
}
