"use client"

import { useEffect, useState } from "react"
import { Activity, Mic, Radio, RefreshCw, ShieldAlert } from "lucide-react"

import { AnalysisState } from "@/components/analysis-state"
import { AsciiBadge, AsciiCard } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

type DeviceState = "checking" | "ready" | "permission" | "unsupported" | "error"

export default function LiveDebatePage() {
  const [deviceState, setDeviceState] = useState<DeviceState>("checking")
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState("")
  const [message, setMessage] = useState("")

  const inspectDevices = async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceState("unsupported")
      return
    }
    setDeviceState("checking")
    setMessage("")
    try {
      let stream: MediaStream | undefined
      if (requestPermission) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      const available = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === "audioinput",
      )
      stream?.getTracks().forEach((track) => track.stop())
      setDevices(available)
      setSelectedDevice((current) => current || available[0]?.deviceId || "")
      setDeviceState(available.some((device) => device.label) ? "ready" : "permission")
    } catch (error) {
      setDeviceState(
        error instanceof DOMException && error.name === "NotAllowedError" ? "permission" : "error",
      )
      setMessage(error instanceof Error ? error.message : "Audio devices could not be inspected.")
    }
  }

  useEffect(() => {
    void inspectDevices()
  }, [])

  const deviceDescription =
    deviceState === "ready"
      ? `${devices.length} audio input${devices.length === 1 ? "" : "s"} available on this device.`
      : deviceState === "permission"
        ? "Microphone names and input readiness require browser permission. No audio is retained by this check."
        : deviceState === "unsupported"
          ? "This browser does not expose the audio-device APIs required for a live session."
          : deviceState === "error"
            ? message || "Audio devices are currently unavailable."
            : "Inspecting audio capabilities on this device…"

  return (
    <AppShell>
      <main className="space-y-6 font-mono text-xs">
        <header className="flex flex-col justify-between gap-4 border border-[#2a2a2a] bg-[#080808] p-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              [LIVE ANALYSIS CONSOLE]
            </div>
            <h1 className="mt-2 text-xl font-bold uppercase text-white">Live Debate</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-zinc-400">
              Configure a local audio input before connecting. This screen never invents a
              transcript or analysis result.
            </p>
          </div>
          <AsciiBadge variant="outline">NOT CONNECTED</AsciiBadge>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
          <div className="space-y-4">
            <AsciiCard title="LIVE DATA" badgeText="DEVICE-LOCAL">
              <div className="space-y-4">
                <div className="flex items-start gap-3 border border-[#262626] bg-black p-4">
                  <Mic className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase text-zinc-500">Audio input</div>
                    <p className="mt-1 text-zinc-300">{deviceDescription}</p>
                    {deviceState === "ready" && (
                      <label className="mt-3 block">
                        <span className="sr-only">Select microphone</span>
                        <select
                          value={selectedDevice}
                          onChange={(event) => setSelectedDevice(event.target.value)}
                          className="min-h-11 w-full border border-[#333] bg-[#0a0a0a] px-3 text-white outline-none focus:border-white"
                        >
                          {devices.map((device, index) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label || `Audio input ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      onClick={() => void inspectDevices(true)}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 border border-[#444] px-3 font-bold text-zinc-200 hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      {deviceState === "permission" ? "ALLOW & CHECK MICROPHONE" : "CHECK AGAIN"}
                    </button>
                  </div>
                </div>
                <AnalysisState
                  kind="empty"
                  title="No live transcript"
                  description="A session has not been connected, so there is no server-backed audio stream or transcript to display."
                />
              </div>
            </AsciiCard>

            <AsciiCard title="PROCESSING" badgeText="SERVER STATUS">
              <AnalysisState
                kind="unavailable"
                title="Live processing unavailable"
                description="No live ingestion contract is available from this application build. Recording and analysis controls remain disabled rather than simulating a session."
              />
            </AsciiCard>
          </div>

          <div className="space-y-4">
            <AsciiCard title="AI FINDINGS" badgeText="PERSISTED ONLY">
              <AnalysisState
                kind="empty"
                title="No findings available"
                description="Findings appear only after a backend has persisted transcript-grounded output. No claims, patterns, scores, or speaker judgments are inferred on this screen."
              />
            </AsciiCard>

            <AsciiCard title="USER ACTIONS" badgeText="SETUP">
              <div className="space-y-3 text-zinc-400">
                <div className="flex items-start gap-2 border border-[#262626] p-3">
                  <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    Check the microphone locally. Permission can be withdrawn in browser settings.
                  </p>
                </div>
                <div className="flex items-start gap-2 border border-[#262626] p-3">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    Start, pause, transcript, and report actions are unavailable until a real live
                    backend is connected.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  aria-describedby="live-action-help"
                  className="min-h-11 w-full cursor-not-allowed border border-[#333] bg-[#111] px-4 font-bold text-zinc-600"
                >
                  START LIVE SESSION — UNAVAILABLE
                </button>
                <p id="live-action-help" className="text-[10px] leading-relaxed text-zinc-600">
                  Existing file, text, and URL analysis flows remain available from New Analysis.
                </p>
              </div>
            </AsciiCard>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
