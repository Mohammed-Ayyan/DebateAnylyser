"use client"

import { useEffect, useState } from "react"

type ConsentControlProps = {
  active: boolean
  version: string | null
}

type ConsentState = "checking" | "idle" | "saving" | "accepted" | "error"

export function ConsentControl({ active, version }: ConsentControlProps) {
  const [state, setState] = useState<ConsentState>("checking")
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!active || !version) return
    const controller = new AbortController()
    void fetch("/api/v1/me", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Current consent status is unavailable.")
        const body = (await response.json()) as {
          user?: { acceptable_use_version?: string | null }
        }
        if (body.user?.acceptable_use_version === version) {
          setState("accepted")
          setMessage(`Policy ${version} is already accepted for this account.`)
        } else {
          setState("idle")
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState("error")
        setMessage(error instanceof Error ? error.message : "Consent status is unavailable.")
      })
    return () => controller.abort()
  }, [active, version])

  if (!active || !version) return null

  const accept = async () => {
    setState("saving")
    setMessage("")
    try {
      const response = await fetch("/api/v1/me/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptable_use_version: version }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
        throw new Error(
          body.error?.message ?? `Consent could not be recorded (${response.status}).`,
        )
      }
      setState("accepted")
      setMessage(`Policy ${version} accepted for this account.`)
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : "Consent could not be recorded.")
    }
  }

  return (
    <div className="mt-4 border-t border-[#262626] pt-4">
      <button
        type="button"
        onClick={accept}
        disabled={state === "checking" || state === "saving" || state === "accepted"}
        className="border border-white bg-white px-4 py-2 text-[10px] font-extrabold uppercase text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-[#333] disabled:bg-[#141414] disabled:text-zinc-500"
      >
        {state === "checking"
          ? "CHECKING ACCEPTANCE…"
          : state === "saving"
            ? "RECORDING ACCEPTANCE…"
            : state === "accepted"
              ? "POLICY ACCEPTED"
              : "ACCEPT CURRENT POLICY"}
      </button>
      {message && (
        <p
          role={state === "error" ? "alert" : "status"}
          className={`mt-3 text-[10px] ${state === "error" ? "text-red-300" : "text-emerald-300"}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
