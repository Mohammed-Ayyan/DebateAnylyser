import "server-only"

import { extractTextTranscript, TEXT_SOURCE_CONTENT_TYPES } from "./text-extractor"
import {
  TranscriptionError,
  type MediaTranscriptionRequest,
  type TranscriptionOutput,
  type TranscriptionProvider,
} from "./contracts"

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > maxBytes) {
    throw new TranscriptionError(
      "TEXT_SOURCE_TOO_LARGE",
      "The remote text exceeds the extraction limit.",
      false,
    )
  }
  if (!response.body) {
    throw new TranscriptionError(
      "SOURCE_FETCH_EMPTY",
      "The remote source returned no content.",
      false,
    )
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new TranscriptionError(
        "TEXT_SOURCE_TOO_LARGE",
        "The remote text exceeds the extraction limit.",
        false,
      )
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchSameOrigin(urlValue: string, init: RequestInit): Promise<Response> {
  const originalOrigin = new URL(urlValue).origin
  let currentUrl = urlValue
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: "manual" })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get("location")
    if (!location) return response
    const nextUrl = new URL(location, currentUrl)
    if (nextUrl.origin !== originalOrigin) {
      throw new TranscriptionError(
        "SOURCE_REDIRECT_UNSAFE",
        "The remote source redirected outside its approved origin.",
        false,
      )
    }
    currentUrl = nextUrl.href
  }
  throw new TranscriptionError(
    "SOURCE_REDIRECT_LIMIT",
    "The remote source redirected too many times.",
    false,
  )
}

export class DevelopmentTextUrlProvider implements TranscriptionProvider {
  constructor(
    private readonly maxBytes: number,
    private readonly timeoutMs: number,
  ) {}

  async transcribe(
    request: MediaTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<TranscriptionOutput> {
    let response: Response
    try {
      response = await fetchSameOrigin(request.mediaUrl, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)])
          : AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "text/plain, text/html, application/pdf" },
      })
    } catch (error) {
      if (error instanceof TranscriptionError) throw error
      throw new TranscriptionError(
        "SOURCE_FETCH_UNAVAILABLE",
        "The approved remote text source could not be fetched.",
        true,
        error,
      )
    }
    if (!response.ok) {
      throw new TranscriptionError(
        "SOURCE_FETCH_FAILED",
        "The approved remote source did not return usable content.",
        response.status >= 500,
      )
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase()
    if (!TEXT_SOURCE_CONTENT_TYPES.has(contentType)) {
      throw new TranscriptionError(
        "ASR_PROVIDER_NOT_CONFIGURED",
        "This media source requires a configured transcription provider.",
        false,
      )
    }
    return extractTextTranscript(contentType, await readBounded(response, this.maxBytes))
  }
}
