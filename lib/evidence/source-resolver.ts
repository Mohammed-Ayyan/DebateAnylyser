import "server-only"

import { lookup } from "node:dns/promises"
import { request } from "node:https"
import type { IncomingMessage } from "node:http"

import { isPrivateOrReservedHost } from "@/lib/legal/rights-gate"
import {
  EvidenceError,
  type EvidenceCandidate,
  type EvidenceSourceResolver,
  type ResolvedEvidenceCandidate,
  type SourceResolutionOptions,
} from "./contracts"

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/json",
  "application/xhtml+xml",
]

export function normalizeSourceText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim()
}

function assertUrlShape(value: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isPrivateOrReservedHost(url.hostname)
  ) {
    throw new EvidenceError(
      "EVIDENCE_SOURCE_URL_UNSAFE",
      "Evidence source URL is not safe for server-side retrieval.",
      false,
    )
  }
  return url
}

async function resolvePublicAddress(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch (error) {
    throw new EvidenceError(
      "EVIDENCE_SOURCE_DNS_UNAVAILABLE",
      "Evidence source host could not be resolved.",
      true,
      error,
    )
  }
  if (addresses.length === 0 || addresses.some((item) => isPrivateOrReservedHost(item.address))) {
    throw new EvidenceError(
      "EVIDENCE_SOURCE_URL_UNSAFE",
      "Evidence source resolves to a private or reserved network.",
      false,
    )
  }
  return addresses[0] as { address: string; family: 4 | 6 }
}

function readResponse(
  response: IncomingMessage,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const cleanup = () => signal?.removeEventListener("abort", abort)
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      response.destroy()
      reject(error)
    }
    const abort = () =>
      fail(new EvidenceError("EVIDENCE_SOURCE_ABORTED", "Source fetch aborted.", true))

    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener("abort", abort, { once: true })
    response.on("data", (chunk: Buffer) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        fail(
          new EvidenceError(
            "EVIDENCE_SOURCE_TOO_LARGE",
            "Evidence source exceeds the configured retrieval limit.",
            false,
          ),
        )
        return
      }
      chunks.push(chunk)
    })
    response.on("end", () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    response.on("error", (error) => fail(error))
  })
}

async function fetchText(
  value: string,
  options: SourceResolutionOptions,
  redirectsRemaining: number,
  signal?: AbortSignal,
): Promise<{ finalUrl: string; text: string }> {
  const url = assertUrlShape(value)
  const resolved = await resolvePublicAddress(url.hostname)
  if (signal?.aborted) {
    throw new EvidenceError("EVIDENCE_SOURCE_ABORTED", "Source fetch aborted.", true)
  }
  return new Promise((resolve, reject) => {
    let timedOut = false
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          accept: "text/html, text/plain, application/json;q=0.9",
          "accept-encoding": "identity",
          "user-agent": "DebateAnalyser-EvidenceVerifier/1.0",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: (_hostname: string, lookupOptions: any, callback: any) => {
          if (typeof lookupOptions === "function") {
            lookupOptions(null, resolved.address, resolved.family)
          } else if (lookupOptions && lookupOptions.all) {
            callback(null, [{ address: resolved.address, family: resolved.family }])
          } else {
            callback(null, resolved.address, resolved.family)
          }
        },
      },
      (response) => {
        const status = response.statusCode ?? 0
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume()
          if (redirectsRemaining <= 0) {
            reject(
              new EvidenceError(
                "EVIDENCE_SOURCE_REDIRECT_LIMIT",
                "Evidence source exceeded the redirect limit.",
                false,
              ),
            )
            return
          }
          const redirected = new URL(response.headers.location, url).toString()
          void fetchText(redirected, options, redirectsRemaining - 1, signal).then(resolve, reject)
          return
        }
        if (status !== 200) {
          response.resume()
          reject(
            new EvidenceError(
              "EVIDENCE_SOURCE_UNRESOLVED",
              "Evidence source did not return a successful response.",
              status === 408 || status === 429 || status >= 500,
            ),
          )
          return
        }

        const declaredLength = Number(response.headers["content-length"] ?? 0)
        if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
          response.resume()
          reject(
            new EvidenceError(
              "EVIDENCE_SOURCE_TOO_LARGE",
              "Evidence source exceeds the configured retrieval limit.",
              false,
            ),
          )
          return
        }
        const contentType = String(response.headers["content-type"] ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase()
        if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
          response.resume()
          reject(
            new EvidenceError(
              "EVIDENCE_SOURCE_CONTENT_UNSUPPORTED",
              "Evidence source content type is not supported for quote verification.",
              false,
            ),
          )
          return
        }
        void readResponse(response, options.maxBytes, signal)
          .then((body) => resolve({ finalUrl: url.toString(), text: normalizeSourceText(body) }))
          .catch(reject)
      },
    )
    const abort = () => req.destroy(new Error("Evidence source request aborted"))
    signal?.addEventListener("abort", abort, { once: true })
    req.setTimeout(options.timeoutMs, () => {
      timedOut = true
      req.destroy(new Error("Evidence source request timed out"))
    })
    req.on("error", (error) => {
      signal?.removeEventListener("abort", abort)
      if (error instanceof EvidenceError) reject(error)
      else {
        reject(
          new EvidenceError(
            timedOut
              ? "EVIDENCE_SOURCE_TIMEOUT"
              : signal?.aborted
                ? "EVIDENCE_SOURCE_ABORTED"
                : "EVIDENCE_SOURCE_NETWORK_ERROR",
            timedOut
              ? "Evidence source retrieval timed out."
              : signal?.aborted
                ? "Evidence source retrieval was interrupted."
                : "Evidence source could not be retrieved.",
            true,
            error,
          ),
        )
      }
    })
    req.on("close", () => signal?.removeEventListener("abort", abort))
    req.end()
  })
}

export class HttpsEvidenceSourceResolver implements EvidenceSourceResolver {
  constructor(private readonly options: SourceResolutionOptions) {}

  async resolve(
    candidate: EvidenceCandidate,
    signal?: AbortSignal,
  ): Promise<ResolvedEvidenceCandidate> {
    const fetched = await fetchText(candidate.url, this.options, this.options.maxRedirects, signal)
    const passage = normalizeSourceText(candidate.passage)
    if (!passage || !fetched.text.includes(passage)) {
      throw new EvidenceError(
        "EVIDENCE_CANDIDATE_PASSAGE_NOT_FOUND",
        "Candidate passage was not found verbatim in the resolved source.",
        false,
      )
    }
    return {
      ...candidate,
      passage,
      finalUrl: fetched.finalUrl,
      sourceText: fetched.text,
    }
  }
}
