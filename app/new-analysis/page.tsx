"use client"

import React, { useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle, FileText, Link2, Play, UploadCloud } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { AsciiBadge, AsciiCard, AsciiProgress } from "@/components/ascii-decorations"
import { AppShell } from "@/components/layout/app-shell"

type Tab = "file" | "text" | "url"
type RightsBasis = "unknown" | "owned" | "permission" | "public_domain" | "licensed"
type IntendedUse = "education" | "research" | "journalism" | "personal_review" | "other"
type Retention = "keep" | "30d" | "90d" | "delete_on_complete"
type UrlAccess = "unknown" | "public" | "private" | "restricted"
type RetrievalMethod = "none" | "official_api" | "official_captions" | "direct_fetch"

const MAX_FILE_BYTES = 500 * 1_048_576
const ACCEPTED_EXTENSIONS = ["txt", "pdf", "docx", "mp4", "mp3", "wav"]

function validateFile(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return "Unsupported file type. Choose TXT, PDF, DOCX, MP4, MP3, or WAV."
  }
  if (file.size === 0) return "This file is empty. Choose a file containing source material."
  if (file.size > MAX_FILE_BYTES) return "This file exceeds the 500 MiB upload limit."
  return ""
}

function isValidPublicUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

type ApiErrorBody = {
  error?: {
    message?: string
    details?: { alternative?: string; allowed?: string[] }
  }
}
type LegalPolicyStatus = {
  active: boolean
  mode: "counsel_approved" | "development_test" | "inactive"
  version: string | null
  sources: { upload: boolean; paste: boolean; url: boolean }
}

async function apiError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody
  const message = body.error?.message ?? `Request failed (${response.status}).`
  const alternative = body.error?.details?.alternative
  const allowed = body.error?.details?.allowed
  return new Error(
    [message, alternative, allowed?.length ? `Allowed: ${allowed.join(", ")}` : undefined]
      .filter(Boolean)
      .join(" "),
  )
}

async function postJson(path: string, body: unknown, idempotencyKey?: string) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      origin: window.location.origin,
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await apiError(response)
  return response.json() as Promise<Record<string, unknown>>
}

function putFile(url: string, file: File, onProgress: (value: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("content-type", file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error("The file upload was interrupted. Please retry."))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else reject(new Error(`Object storage rejected the upload (${xhr.status}).`))
    }
    xhr.send(file)
  })
}

function DemoTranscriptSection({
  router,
  submitting,
}: {
  router: { push: (url: string) => void }
  submitting: boolean
}) {
  const [demoLoading, setDemoLoading] = useState<string | null>(null)
  const [demoError, setDemoError] = useState("")

  const launchDemo = async (slug: string) => {
    if (demoLoading || submitting) return
    setDemoLoading(slug)
    setDemoError("")
    try {
      const response = await fetch("/api/v1/demo", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", origin: window.location.origin },
        body: JSON.stringify({ slug }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string }
        }
        throw new Error(body.error?.message ?? `Demo creation failed (${response.status}).`)
      }
      const result = (await response.json()) as { id: string; status: string }
      router.push(`/workspace?analysis=${encodeURIComponent(result.id)}`)
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Demo analysis could not be created.")
      setDemoLoading(null)
    }
  }

  return (
    <AsciiCard title="TRY DEMO ANALYSIS" badgeText="PRECOMPUTED">
      <p className="mb-3 text-[10px] leading-relaxed text-zinc-400">
        Explore the analysis pipeline with precomputed results. No API keys or live providers
        required. Demo analyses are clearly marked and use original transcript content.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!!demoLoading || submitting}
          onClick={() => launchDemo("debate-demo-1")}
          className="flex min-h-20 flex-col justify-between border border-[#333] bg-[#0a0a0a] p-3 text-left transition-colors hover:border-emerald-800 hover:bg-emerald-950/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex items-center justify-between">
            <Play className="h-3.5 w-3.5 text-emerald-400" />
            <AsciiBadge variant="default">DEMO</AsciiBadge>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold text-white">Policy Debate — Renewable Energy</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              {demoLoading === "debate-demo-1"
                ? "Creating demo analysis…"
                : "12 segments · 9 claims · 1 pattern"}
            </div>
          </div>
        </button>
        <button
          type="button"
          disabled={!!demoLoading || submitting}
          onClick={() => launchDemo("debate-demo-2")}
          className="flex min-h-20 flex-col justify-between border border-[#333] bg-[#0a0a0a] p-3 text-left transition-colors hover:border-emerald-800 hover:bg-emerald-950/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex items-center justify-between">
            <Play className="h-3.5 w-3.5 text-emerald-400" />
            <AsciiBadge variant="default">DEMO</AsciiBadge>
          </div>
          <div className="mt-2">
            <div className="text-xs font-bold text-white">Complex Debate — AI Regulation</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">
              {demoLoading === "debate-demo-2"
                ? "Creating demo analysis…"
                : "15 segments · 10 claims · 3 patterns"}
            </div>
          </div>
        </button>
      </div>
      {demoError && (
        <p role="alert" className="mt-2 text-[11px] text-red-300">
          {demoError}
        </p>
      )}
      <div className="mt-3 flex gap-3 text-[10px] text-zinc-500">
        <a
          href="/test-transcripts/debate-demo-1.txt"
          download
          className="underline underline-offset-2 hover:text-zinc-300"
        >
          Download Transcript 1
        </a>
        <a
          href="/test-transcripts/debate-demo-2.txt"
          download
          className="underline underline-offset-2 hover:text-zinc-300"
        >
          Download Transcript 2
        </a>
      </div>
    </AsciiCard>
  )
}

export default function NewAnalysisPage() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>("file")
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [transcriptText, setTranscriptText] = useState("")
  const [urlInput, setUrlInput] = useState("")
  const [urlAccess, setUrlAccess] = useState<UrlAccess>("unknown")
  const [retrievalMethod, setRetrievalMethod] = useState<RetrievalMethod>("none")
  const [rightsBasis, setRightsBasis] = useState<RightsBasis>("unknown")
  const [intendedUse, setIntendedUse] = useState<IntendedUse>("education")
  const [retention, setRetention] = useState<Retention>("keep")
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [legalPolicy, setLegalPolicy] = useState<LegalPolicyStatus | null>(null)
  const [legalPolicyError, setLegalPolicyError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/v1/legal/policy", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Legal policy availability could not be verified.")
        setLegalPolicy((await response.json()) as LegalPolicyStatus)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLegalPolicyError(
            error instanceof Error ? error.message : "Legal policy availability is unknown.",
          )
        }
      })
    void fetch("/api/v1/me", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as {
          user?: { default_retention_setting?: Retention }
        }
        if (body.user?.default_retention_setting) {
          setRetention(body.user.default_retention_setting)
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const selectFile = (nextFile: File | undefined) => {
    if (!nextFile) return
    const validationError = validateFile(nextFile)
    setUploadProgress(0)
    setStatusMessage("")
    setErrorMessage(validationError)
    setFile(validationError ? null : nextFile)
  }

  const policyIssue = legalPolicyError
    ? legalPolicyError
    : !legalPolicy
      ? "Checking legal policy availability…"
      : !legalPolicy.active
        ? "Analysis intake is disabled because the published legal policy is still draft or inactive."
        : activeTab === "file" && !legalPolicy.sources.upload
          ? "File uploads are unavailable under the current approved policy."
          : activeTab === "text" && !legalPolicy.sources.paste
            ? "Pasted transcripts are unavailable under the current approved policy."
            : activeTab === "url" && !legalPolicy.sources.url
              ? "No URL providers are enabled under the current approved policy."
              : ""
  const sourceIssue =
    policyIssue ||
    (rightsBasis === "unknown"
      ? "Select the rights basis that authorizes this analysis."
      : activeTab === "file"
        ? file
          ? ""
          : "Choose a supported source file."
        : activeTab === "text"
          ? transcriptText.trim().length >= 20
            ? ""
            : "Paste at least 20 characters of authorized transcript text."
          : !isValidPublicUrl(urlInput.trim())
            ? "Enter a valid HTTPS source URL."
            : urlAccess === "private" || urlAccess === "restricted"
              ? "This URL cannot be retrieved through the public-source flow. Use an authorized upload or paste instead."
              : urlAccess !== "public"
                ? "Confirm that the URL is publicly accessible."
                : retrievalMethod === "none"
                  ? "Select the authorized retrieval method."
                  : "")
  const sourceReady = !sourceIssue

  const handleLaunch = async () => {
    if (!sourceReady || submitting) return
    setSubmitting(true)
    setErrorMessage("")
    setStatusMessage("Validating rights and source metadata…")
    try {
      let source: Record<string, unknown>
      if (activeTab === "file" && file) {
        const reservation = await postJson("/api/v1/uploads", {
          filename: file.name,
          content_type: file.type,
          size: file.size,
          rights_basis: rightsBasis,
          intended_use: intendedUse,
        })
        const uploadUrl = reservation.upload_url
        const mediaKey = reservation.media_key
        if (typeof uploadUrl !== "string" || typeof mediaKey !== "string") {
          throw new Error("The upload reservation response was incomplete.")
        }
        setStatusMessage("Uploading source file…")
        await putFile(uploadUrl, file, setUploadProgress)
        source = { source_type: "upload", media_key: mediaKey }
      } else if (activeTab === "text") {
        source = { source_type: "paste", paste_text: transcriptText }
      } else {
        source = {
          source_type: "url",
          url: urlInput,
          access: urlAccess,
          retrieval_method: retrievalMethod,
        }
      }

      setStatusMessage("Creating durable analysis job…")
      const result = await postJson(
        "/api/v1/analyses",
        {
          ...source,
          rights_basis: rightsBasis,
          intended_use: intendedUse,
          retention_setting: retention,
        },
        crypto.randomUUID(),
      )
      if (typeof result.id !== "string" || result.status !== "queued") {
        throw new Error("The analysis creation response was incomplete.")
      }
      setStatusMessage("Analysis queued. Opening processing view…")
      router.push(`/processing?analysis=${encodeURIComponent(result.id)}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Analysis could not be submitted.")
      setStatusMessage("")
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between border border-[#262626] bg-[#080808] p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              [DISCOURSE INGESTION]
            </div>
            <h1 className="mt-1 text-xl font-bold uppercase text-white">
              Start New Debate Analysis
            </h1>
          </div>
          <AsciiBadge variant="default">RIGHTS-GATED INPUT</AsciiBadge>
        </div>

        {(legalPolicyError || (legalPolicy && !legalPolicy.active)) && (
          <div
            role="alert"
            className="border border-amber-800/60 bg-amber-950/30 p-4 text-xs leading-relaxed text-amber-200"
          >
            <p className="font-bold uppercase">Analysis intake unavailable</p>
            <p className="mt-2">
              {legalPolicyError ||
                "The published legal policy is draft or inactive, so source material cannot be submitted in this deployment."}
            </p>
            <Link
              href="/legal"
              className="mt-3 inline-flex min-h-10 items-center font-bold text-white underline underline-offset-4"
            >
              VIEW POLICY STATUS
            </Link>
          </div>
        )}

        {legalPolicy?.mode === "development_test" && (
          <div
            role="status"
            className="border border-cyan-800/60 bg-cyan-950/30 p-4 text-xs leading-relaxed text-cyan-200"
          >
            <p className="font-bold uppercase">Local development test policy active</p>
            <p className="mt-2">
              Use only material you own, have permission to use, or that is public domain. This mode
              cannot activate in staging or production and is not counsel approval.
            </p>
          </div>
        )}

        <DemoTranscriptSection router={router} submitting={submitting} />

        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          role="tablist"
          aria-label="Choose source input method"
        >
          {[
            { id: "file", label: "Upload File", icon: UploadCloud, sub: "TXT, PDF, DOCX, A/V" },
            {
              id: "text",
              label: "Paste Transcript",
              icon: FileText,
              sub: "Raw Text / Subtitles",
            },
            { id: "url", label: "Import URL", icon: Link2, sub: "Approved Public Source" },
          ].map((tab) => {
            const Icon = tab.icon
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`source-tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`source-panel-${tab.id}`}
                tabIndex={isSelected ? 0 : -1}
                disabled={submitting}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
                  const order: Tab[] = ["file", "text", "url"]
                  const index = order.indexOf(tab.id as Tab)
                  const offset = event.key === "ArrowRight" ? 1 : -1
                  const next = order[(index + offset + order.length) % order.length]
                  setActiveTab(next)
                  document.getElementById(`source-tab-${next}`)?.focus()
                }}
                onClick={() => {
                  setActiveTab(tab.id as Tab)
                  setErrorMessage("")
                  setStatusMessage("")
                }}
                className={`flex min-h-24 flex-col justify-between border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${
                  isSelected
                    ? "border-white bg-[#141414] font-bold text-white"
                    : "border-[#262626] bg-black text-zinc-400 hover:border-[#444] hover:text-zinc-200"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4" />
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div className="mt-3">
                  <div className="text-xs uppercase">{tab.label}</div>
                  <div className="mt-0.5 text-[10px] font-normal text-zinc-500">{tab.sub}</div>
                </div>
              </button>
            )
          })}
        </div>

        {activeTab === "file" && (
          <div
            id="source-panel-file"
            role="tabpanel"
            aria-labelledby="source-tab-file"
            className="space-y-4"
          >
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              accept=".txt,.pdf,.docx,.mp4,.mp3,.wav,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,video/mp4,audio/mpeg,audio/wav"
              disabled={submitting}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <div
              role="button"
              tabIndex={submitting ? -1 : 0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInput.current?.click()
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!submitting) setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                if (!submitting) selectFile(event.dataTransfer.files[0])
              }}
              onClick={() => !submitting && fileInput.current?.click()}
              aria-label={file ? "Replace selected source file" : "Choose or drop a source file"}
              aria-describedby="file-upload-help"
              className={`cursor-pointer border-2 border-dashed p-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none sm:p-10 ${
                dragOver
                  ? "border-white bg-[#141414]"
                  : file
                    ? "border-emerald-800 bg-emerald-950/20"
                    : "border-[#333] bg-[#050505] hover:border-zinc-500"
              }`}
            >
              <UploadCloud className="mx-auto mb-3 h-8 w-8 text-zinc-400" />
              {file ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400">
                    <CheckCircle className="h-4 w-4" />
                    <span>FILE SELECTED — SERVER VALIDATION PENDING</span>
                  </div>
                  <div className="break-all font-mono text-xs text-white">
                    {file.name} ({(file.size / 1_048_576).toFixed(1)} MB)
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Click or drop another file to replace
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase text-white">
                    Drag & Drop Discourse File Here
                  </div>
                  <div id="file-upload-help" className="text-[11px] text-zinc-400">
                    {dragOver
                      ? "Release to validate this file"
                      : "TXT, PDF, DOCX, MP4, MP3, or WAV · maximum 500 MiB"}
                  </div>
                  <div className="inline-block border border-[#333] bg-black px-3 py-1 text-[10px] text-zinc-300">
                    BROWSE LOCAL FILES
                  </div>
                </div>
              )}
            </div>
            {submitting && uploadProgress > 0 && (
              <AsciiProgress value={uploadProgress} className="justify-center" />
            )}
          </div>
        )}

        {activeTab === "text" && (
          <div
            id="source-panel-text"
            role="tabpanel"
            aria-labelledby="source-tab-text"
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>RAW TRANSCRIPT INPUT</span>
              <span>CHARACTERS: {transcriptText.length.toLocaleString()}</span>
            </div>
            <textarea
              rows={8}
              value={transcriptText}
              disabled={submitting}
              onChange={(event) => setTranscriptText(event.target.value)}
              className="w-full resize-y border border-[#262626] bg-[#080808] p-3 font-mono text-xs text-white outline-none focus:border-white disabled:opacity-60"
              placeholder="Paste authorized debate transcript here…"
            />
          </div>
        )}

        {activeTab === "url" && (
          <div
            id="source-panel-url"
            role="tabpanel"
            aria-labelledby="source-tab-url"
            className="space-y-3"
          >
            <label
              htmlFor="source-url"
              className="block text-[10px] font-bold uppercase text-zinc-400"
            >
              APPROVED PUBLIC SOURCE URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="source-url"
                type="url"
                value={urlInput}
                disabled={submitting}
                onChange={(event) => setUrlInput(event.target.value)}
                className="min-w-0 flex-1 border border-[#262626] bg-[#080808] px-3 py-2 font-mono text-xs text-white outline-none focus:border-white disabled:opacity-60"
                placeholder="https://approved-provider.example/debate"
              />
              <select
                aria-label="Retrieval method"
                value={retrievalMethod}
                disabled={submitting}
                onChange={(event) => setRetrievalMethod(event.target.value as RetrievalMethod)}
                className="border border-[#333] bg-[#141414] px-3 py-2 text-xs font-bold text-white outline-none disabled:opacity-60"
              >
                <option value="none">SELECT METHOD</option>
                <option value="official_api">OFFICIAL API</option>
                <option value="official_captions">OFFICIAL CAPTIONS</option>
                <option value="direct_fetch">DIRECT PUBLIC FETCH</option>
              </select>
            </div>
            <div className="border border-[#262626] bg-[#050505] p-3 text-xs">
              <label htmlFor="source-access" className="text-[10px] font-bold text-zinc-400">
                ACCESS CLASSIFICATION
              </label>
              <select
                id="source-access"
                value={urlAccess}
                disabled={submitting}
                onChange={(event) => setUrlAccess(event.target.value as UrlAccess)}
                className="mt-2 w-full border border-[#333] bg-black p-2 font-mono text-white outline-none disabled:opacity-60"
              >
                <option value="unknown">SELECT ACCESS</option>
                <option value="public">PUBLICLY ACCESSIBLE</option>
                <option value="private">PRIVATE</option>
                <option value="restricted">PLATFORM-RESTRICTED</option>
              </select>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                F1 validates rights and queues this URL; it does not fetch the source yet.
              </p>
            </div>
          </div>
        )}

        <AsciiCard title="PIPELINE CONFIGURATION" badgeText="REQUIRED">
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
            <div>
              <label
                htmlFor="rights-basis"
                className="mb-1 block text-[10px] font-bold uppercase text-zinc-400"
              >
                Rights Basis
              </label>
              <select
                id="rights-basis"
                value={rightsBasis}
                disabled={submitting}
                onChange={(event) => setRightsBasis(event.target.value as RightsBasis)}
                className="w-full border border-[#333] bg-black p-2 font-mono text-white outline-none disabled:opacity-60"
              >
                <option value="unknown">Select authorization</option>
                <option value="owned">I own this content</option>
                <option value="permission">I have permission</option>
                <option value="licensed">Licensed for this use</option>
                <option value="public_domain">Public domain</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="intended-use"
                className="mb-1 block text-[10px] font-bold uppercase text-zinc-400"
              >
                Intended Use
              </label>
              <select
                id="intended-use"
                value={intendedUse}
                disabled={submitting}
                onChange={(event) => setIntendedUse(event.target.value as IntendedUse)}
                className="w-full border border-[#333] bg-black p-2 font-mono text-white outline-none disabled:opacity-60"
              >
                <option value="education">Education</option>
                <option value="research">Research</option>
                <option value="journalism">Journalism</option>
                <option value="personal_review">Personal review</option>
                <option value="other">Other permitted analysis</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="retention"
                className="mb-1 block text-[10px] font-bold uppercase text-zinc-400"
              >
                Retention
              </label>
              <select
                id="retention"
                value={retention}
                disabled={submitting}
                onChange={(event) => setRetention(event.target.value as Retention)}
                className="w-full border border-[#333] bg-black p-2 font-mono text-white outline-none disabled:opacity-60"
              >
                <option value="keep">Keep until I delete</option>
                <option value="30d">Delete after 30 days</option>
                <option value="90d">Delete after 90 days</option>
                <option value="delete_on_complete">Delete analysis after completion</option>
              </select>
            </div>
          </div>
          <p className="mt-4 border-t border-[#262626] pt-3 text-[10px] leading-relaxed text-zinc-500">
            Submission confirms authorization and permitted use under the current{" "}
            <Link
              href="/legal"
              className="text-zinc-200 underline underline-offset-2 hover:text-white"
            >
              legal and acceptable-use policy
            </Link>
            . Content is treated as untrusted data, never as instructions.
          </p>
        </AsciiCard>

        <div aria-live="polite" className="min-h-5 text-xs">
          {errorMessage && (
            <p role="alert" className="border border-red-900 bg-red-950/30 p-3 text-red-300">
              {errorMessage}
            </p>
          )}
          {!errorMessage && statusMessage && (
            <p className="border border-[#333] bg-[#080808] p-3 text-zinc-300">{statusMessage}</p>
          )}
          {!errorMessage && !statusMessage && sourceIssue && (
            <p
              className={`border p-3 text-[11px] leading-relaxed ${
                activeTab === "url" && (urlAccess === "private" || urlAccess === "restricted")
                  ? "border-amber-900 bg-amber-950/20 text-amber-200"
                  : "border-[#262626] bg-[#080808] text-zinc-400"
              }`}
            >
              {sourceIssue}
            </p>
          )}
          {!errorMessage && !statusMessage && !sourceIssue && (
            <p className="border border-emerald-900 bg-emerald-950/20 p-3 text-emerald-200">
              SOURCE READY · Review the retention choice, then launch the analysis. You can follow
              durable progress on the next screen.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleLaunch}
          disabled={!sourceReady || submitting}
          className="flex w-full items-center justify-center gap-2 border border-white bg-white py-4 text-sm font-extrabold uppercase tracking-wider text-black shadow-lg transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:border-[#333] disabled:bg-[#141414] disabled:text-zinc-500"
        >
          <span>
            {submitting ? "SUBMITTING AUTHORIZED SOURCE…" : "LAUNCH DEBATE ANALYSIS PIPELINE"}
          </span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </AppShell>
  )
}
