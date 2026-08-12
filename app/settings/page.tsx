"use client"

import React, { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Shield, Sliders, User } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"
import { TourRestartButton } from "@/components/onboarding/tour-restart-button"

type Tab = "profile" | "account" | "appearance" | "danger"
type MeResponse = {
  user: {
    email: string
    created_at: string
    default_retention_setting: "keep" | "30d" | "90d" | "delete_on_complete"
  }
  preferences: {
    confidence_display: "categorical"
    jargon_plain_language: boolean
    reading_density: "comfortable" | "low_density"
    accessibility_prefs: {
      reduced_motion?: boolean
      high_contrast?: boolean
      screen_reader_optimized?: boolean
    }
  }
}

type DataExportStatus = {
  enabled: boolean
  export: {
    id: string
    status: "queued" | "processing" | "complete" | "failed" | "revoked"
    download_url?: string
  } | null
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile")
  const [account, setAccount] = useState<MeResponse | null>(null)
  const [dataExport, setDataExport] = useState<DataExportStatus>({ enabled: false, export: null })
  const [exporting, setExporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const exportTimer = useRef<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError("")
    void Promise.all([
      fetch("/api/v1/me", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/v1/me/data-export", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(async ([accountResponse, exportResponse]) => {
        if (!accountResponse.ok) throw new Error("Account settings are unavailable.")
        setAccount((await accountResponse.json()) as MeResponse)
        if (exportResponse.ok) setDataExport((await exportResponse.json()) as DataExportStatus)
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return
        setError(loadError instanceof Error ? loadError.message : "Settings loading failed.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      if (exportTimer.current !== null) window.clearTimeout(exportTimer.current)
    }
  }, [reloadKey])

  const updatePreference = <K extends keyof MeResponse["preferences"]>(
    key: K,
    value: MeResponse["preferences"][K],
  ) => {
    setAccount((current) =>
      current ? { ...current, preferences: { ...current.preferences, [key]: value } } : current,
    )
  }
  const savePreferences = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!account || saving) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/v1/me/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify(account.preferences),
      })
      if (!response.ok) throw new Error("Preferences could not be saved.")
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preferences could not be saved.")
    } finally {
      setSaving(false)
    }
  }
  const saveDefaultRetention = async (value: MeResponse["user"]["default_retention_setting"]) => {
    if (!account) return
    const previous = account.user.default_retention_setting
    setError("")
    setAccount({ ...account, user: { ...account.user, default_retention_setting: value } })
    try {
      const response = await fetch("/api/v1/me/settings", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ default_retention_setting: value }),
      })
      if (!response.ok) throw new Error("Default retention could not be saved.")
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (cause) {
      setAccount((current) =>
        current
          ? { ...current, user: { ...current.user, default_retention_setting: previous } }
          : current,
      )
      setError(cause instanceof Error ? cause.message : "Default retention could not be saved.")
    }
  }
  const requestAccountDeletion = async () => {
    if (!window.confirm("Delete this account and all owned analyses? This cannot be undone."))
      return
    setDeleting(true)
    const response = await fetch("/api/v1/me", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { origin: window.location.origin },
    })
    if (!response.ok) {
      setDeleting(false)
      setError("Account deletion could not be requested.")
      return
    }
    window.location.assign("/auth/signin")
  }
  const pollDataExport = async () => {
    const response = await fetch("/api/v1/me/data-export", {
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Account data export status is unavailable.")
    const status = (await response.json()) as DataExportStatus
    setDataExport(status)
    if (status.export?.status === "queued" || status.export?.status === "processing") {
      exportTimer.current = window.setTimeout(
        () => void pollDataExport().catch(showExportFailure),
        1_500,
      )
    } else {
      setExporting(false)
    }
  }
  const showExportFailure = (cause: unknown) => {
    setExporting(false)
    setError(cause instanceof Error ? cause.message : "Account data export failed.")
  }
  const requestDataExport = async () => {
    setExporting(true)
    setError("")
    const response = await fetch("/api/v1/me/data-export", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", origin: window.location.origin },
      body: JSON.stringify({ include_transcript: false }),
    })
    if (!response.ok) throw new Error("Account data export is unavailable.")
    setDataExport({ enabled: true, export: await response.json() })
    await pollDataExport()
  }
  const tabs = [
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "account" as const, label: "Account & Security", icon: Shield },
    { id: "appearance" as const, label: "Reading Preferences", icon: Sliders },
    { id: "danger" as const, label: "Danger Zone", icon: AlertTriangle },
  ]

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 font-mono text-xs">
        <div className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [PLATFORM PREFERENCES]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Account & Analysis Settings
            </h1>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <AsciiBadge variant="default">OWNER SETTINGS</AsciiBadge>
            <TourRestartButton className="min-h-10 px-3 py-1.5 text-[10px]" />
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex flex-wrap items-center gap-1 border-b border-[#262626] pb-2"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`settings-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  const index = tabs.findIndex((item) => item.id === tab.id)
                  const offset = event.key === "ArrowRight" ? 1 : -1
                  const next = tabs[(index + offset + tabs.length) % tabs.length]
                  setActiveTab(next.id)
                  document.getElementById(`settings-tab-${next.id}`)?.focus()
                }}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-11 items-center gap-2 border px-3 py-2 transition-all focus-visible:outline-2 focus-visible:outline-white ${activeTab === tab.id ? "border-white bg-white font-bold text-black" : "border-[#333] bg-black text-zinc-400 hover:text-white"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {saved && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border border-emerald-900 bg-emerald-950/20 p-3 font-bold text-emerald-400"
          >
            <Check className="h-4 w-4" />
            <span>PREFERENCES SAVED</span>
          </div>
        )}
        {loading && (
          <AnalysisState
            kind="loading"
            title="Loading account settings"
            description="Retrieving your identity, retention defaults, reading preferences, and export availability."
          />
        )}
        {error && (
          <AnalysisState
            kind="error"
            title="Settings unavailable"
            description={error}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="min-h-10 border border-white px-3 font-bold text-white"
              >
                RETRY
              </button>
            }
          />
        )}

        <div
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {activeTab === "profile" && (
            <AsciiCard title="USER PROFILE DETAILS">
              <div className="max-w-lg space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="profile-email"
                    className="text-[10px] font-bold uppercase text-zinc-400"
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    id="profile-email"
                    readOnly
                    value={account?.user.email ?? "Loading…"}
                    className="w-full border border-[#262626] bg-[#0a0a0a] p-2.5 text-zinc-300 outline-none"
                  />
                </div>
                <p className="text-[10px] text-zinc-500">
                  Identity details are managed by the configured sign-in provider.
                </p>
              </div>
            </AsciiCard>
          )}
          {activeTab === "appearance" && account && (
            <AsciiCard title="CONFIDENCE & READING PREFERENCES">
              <form onSubmit={savePreferences} className="max-w-lg space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">
                    CONFIDENCE DISPLAY
                  </label>
                  <input
                    readOnly
                    value="Categorical (High / Medium / Low / Insufficient)"
                    className="w-full border border-[#262626] bg-[#0a0a0a] p-2.5 text-white outline-none"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Raw model confidence and percentages are never public. Uncalibrated values
                    display as Insufficient.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-400">
                    READING DENSITY
                  </label>
                  <select
                    value={account.preferences.reading_density}
                    onChange={(event) =>
                      updatePreference(
                        "reading_density",
                        event.target.value as "comfortable" | "low_density",
                      )
                    }
                    className="w-full border border-[#262626] bg-[#0a0a0a] p-2.5 text-white outline-none"
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="low_density">Low density</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 border border-[#262626] bg-[#080808] p-3">
                  <input
                    type="checkbox"
                    checked={account.preferences.accessibility_prefs.reduced_motion ?? false}
                    onChange={(event) =>
                      updatePreference("accessibility_prefs", {
                        ...account.preferences.accessibility_prefs,
                        reduced_motion: event.target.checked,
                      })
                    }
                  />
                  <span>Reduce non-essential motion</span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="border border-white bg-white px-5 py-2.5 font-bold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "SAVING…" : "SAVE PREFERENCES"}
                </button>
              </form>
            </AsciiCard>
          )}

          {activeTab === "account" && account && (
            <div className="space-y-4">
              <AsciiCard title="ACCOUNT RETENTION DEFAULT">
                <div className="max-w-lg space-y-3">
                  <label
                    htmlFor="default-retention"
                    className="text-[10px] font-bold uppercase text-zinc-400"
                  >
                    NEW ANALYSIS RETENTION
                  </label>
                  <select
                    id="default-retention"
                    value={account.user.default_retention_setting}
                    onChange={(event) =>
                      void saveDefaultRetention(
                        event.target.value as MeResponse["user"]["default_retention_setting"],
                      )
                    }
                    className="w-full border border-[#262626] bg-[#0a0a0a] p-2.5 text-white outline-none"
                  >
                    <option value="keep">Keep until manually deleted</option>
                    <option value="30d">Delete 30 days after creation</option>
                    <option value="90d">Delete 90 days after creation</option>
                    <option value="delete_on_complete">Delete only after completion</option>
                  </select>
                  <p className="text-[10px] text-zinc-500">
                    This default applies to new analyses. Existing analyses retain their selected
                    schedule.
                  </p>
                </div>
              </AsciiCard>
              <AsciiCard title="ACCOUNT DATA EXPORT">
                <div className="max-w-2xl space-y-3">
                  <p className="text-zinc-400">
                    Request an immutable JSON archive of allow-listed account data and public
                    post-S9 analysis. Transcript content is excluded from this request.
                  </p>
                  {!dataExport.enabled ? (
                    <p className="border border-[#333] p-3 text-zinc-500">
                      ACCOUNT DATA EXPORT UNAVAILABLE
                    </p>
                  ) : (
                    <>
                      <button
                        disabled={
                          exporting ||
                          dataExport.export?.status === "queued" ||
                          dataExport.export?.status === "processing"
                        }
                        onClick={() => void requestDataExport().catch(showExportFailure)}
                        className="border border-white bg-white px-4 py-2 font-bold text-black disabled:opacity-40"
                      >
                        {exporting ? "PREPARING…" : "REQUEST JSON EXPORT"}
                      </button>
                      {dataExport.export && <p>STATUS: {dataExport.export.status.toUpperCase()}</p>}
                      {dataExport.export?.download_url && (
                        <a
                          className="inline-block border border-[#333] px-4 py-2 text-white underline"
                          href={dataExport.export.download_url}
                        >
                          DOWNLOAD ACCOUNT DATA
                        </a>
                      )}
                    </>
                  )}
                </div>
              </AsciiCard>
            </div>
          )}

          {activeTab === "danger" && (
            <AsciiCard title="ACCOUNT DELETION">
              <div className="max-w-2xl space-y-4">
                <p className="text-zinc-400">
                  Deletion immediately disables the account and hides owned analyses. Durable
                  cleanup removes source and export objects before database records are erased.
                </p>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void requestAccountDeletion()}
                  className="border border-red-800 px-4 py-2 font-bold text-red-300 hover:border-red-500 disabled:opacity-50"
                >
                  {deleting ? "DELETION REQUESTED…" : "DELETE ACCOUNT"}
                </button>
              </div>
            </AsciiCard>
          )}
        </div>
      </div>
    </AppShell>
  )
}
