import "server-only"

import {
  EvidenceError,
  evidenceRetrievalOutputSchema,
  type EvidenceCandidate,
  type EvidenceRetrievalRequest,
  type EvidenceRetriever,
} from "./contracts"
import { normalizeSourceText } from "./source-resolver"

export type WikipediaEvidenceRetrieverOptions = {
  apiUrl?: string
  userAgent?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_API_URL = "https://en.wikipedia.org/w/api.php"
const DEFAULT_USER_AGENT =
  "DebateAnalyser-EvidenceVerifier/1.0 (https://github.com/Mohammed-Ayyan/DebateAnylyser; contact: local-analyser@debate.local)"
const DEFAULT_TIMEOUT_MS = 20_000

const STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren't",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can't",
  "cannot",
  "could",
  "couldn't",
  "did",
  "didn't",
  "do",
  "does",
  "doesn't",
  "doing",
  "don't",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "hadn't",
  "has",
  "hasn't",
  "have",
  "haven't",
  "having",
  "he",
  "he'd",
  "he'll",
  "he's",
  "her",
  "here",
  "here's",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "how's",
  "i",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "it's",
  "its",
  "itself",
  "let's",
  "me",
  "more",
  "most",
  "mustn't",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shan't",
  "she",
  "she'd",
  "she'll",
  "she's",
  "should",
  "shouldn't",
  "so",
  "some",
  "such",
  "than",
  "that",
  "that's",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "there's",
  "these",
  "they",
  "they'd",
  "they'll",
  "they're",
  "they've",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "wasn't",
  "we",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "were",
  "weren't",
  "what",
  "what's",
  "when",
  "when's",
  "where",
  "where's",
  "which",
  "while",
  "who",
  "who's",
  "whom",
  "why",
  "why's",
  "with",
  "won't",
  "would",
  "wouldn't",
  "you",
  "you'd",
  "you'll",
  "you're",
  "you've",
  "your",
  "yours",
  "yourself",
  "yourselves",
])

export function extractSearchTerms(claimText: string): string {
  const cleaned = claimText
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const words = cleaned.split(" ").filter((w) => w.length > 1)
  const meaningful = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()))
  if (meaningful.length >= 2) {
    return meaningful.slice(0, 8).join(" ")
  }
  return words.slice(0, 6).join(" ")
}

export function extractPassageFromNormalized(normalized: string, query: string): string | null {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))

  const sentenceRegex = /[^.!?]+[.!?]+/g
  const rawMatches = normalized.match(sentenceRegex) || []

  const cleanCandidates: string[] = []
  for (const s of rawMatches) {
    const trimmed = s.trim()
    if (trimmed.length < 40 || trimmed.length > 600) continue
    if (/[{}|<>=\\\/]/.test(trimmed)) continue
    // Verify that the trimmed sentence is found verbatim in normalized
    if (normalized.includes(trimmed)) {
      cleanCandidates.push(trimmed)
    }
  }

  if (cleanCandidates.length === 0) return null

  let best = cleanCandidates[0]
  let bestScore = -1

  for (const cand of cleanCandidates) {
    const lower = cand.toLowerCase()
    const score = terms.filter((term) => lower.includes(term)).length
    if (score > bestScore) {
      bestScore = score
      best = cand
    }
  }

  return best
}

function handleResponseError(status: number): EvidenceError {
  if (status === 401 || status === 403) {
    return new EvidenceError(
      "EVIDENCE_RETRIEVER_AUTHENTICATION_FAILED",
      "Evidence retriever authentication failed.",
      false,
    )
  }
  if (status === 400 || status === 404 || status === 422) {
    return new EvidenceError(
      "EVIDENCE_RETRIEVER_REQUEST_REJECTED",
      "Evidence retriever rejected the bounded claim request.",
      false,
    )
  }
  return new EvidenceError(
    "EVIDENCE_RETRIEVER_UNAVAILABLE",
    "Evidence retrieval is temporarily unavailable.",
    status === 408 || status === 409 || status === 429 || status >= 500,
  )
}

export class WikipediaEvidenceRetriever implements EvidenceRetriever {
  private readonly apiUrl: string
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: WikipediaEvidenceRetrieverOptions = {}) {
    this.apiUrl = options.apiUrl ?? DEFAULT_API_URL
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async retrieve(request: EvidenceRetrievalRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Evidence retrieval timed out"))
    }, this.timeoutMs)

    try {
      const query = extractSearchTerms(request.claimText)
      if (!query.trim()) {
        return { candidates: [] }
      }

      const searchUrl = new URL(this.apiUrl)
      searchUrl.searchParams.set("action", "query")
      searchUrl.searchParams.set("list", "search")
      searchUrl.searchParams.set("srsearch", query)
      searchUrl.searchParams.set("srlimit", String(Math.min(request.maxCandidates, 10)))
      searchUrl.searchParams.set("format", "json")
      searchUrl.searchParams.set("origin", "*")

      const searchResponse = await this.fetchImpl(searchUrl.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": this.userAgent,
        },
        signal: controller.signal,
      })

      if (!searchResponse.ok) {
        throw handleResponseError(searchResponse.status)
      }

      let searchData: unknown
      try {
        searchData = await searchResponse.json()
      } catch (error) {
        throw new EvidenceError(
          "EVIDENCE_RETRIEVER_INVALID_RESPONSE",
          "Evidence retriever returned an invalid candidate envelope.",
          true,
          error,
        )
      }

      const parsed = searchData as { query?: { search?: Array<{ title?: string }> } } | null
      const searchHits = parsed?.query?.search ?? []
      if (searchHits.length === 0) {
        return { candidates: [] }
      }

      const candidates: EvidenceCandidate[] = []

      for (const hit of searchHits.slice(0, request.maxCandidates)) {
        if (!hit.title) continue
        const pageTitle = hit.title
        const encodedTitle = encodeURIComponent(pageTitle.replace(/ /g, "_"))
        const pageUrl = `https://en.wikipedia.org/wiki/${encodedTitle}`

        try {
          const pageResponse = await this.fetchImpl(pageUrl, {
            method: "GET",
            headers: {
              accept: "text/html, text/plain",
              "user-agent": this.userAgent,
            },
            signal: controller.signal,
          })

          if (!pageResponse.ok) {
            continue
          }

          const html = await pageResponse.text()
          const normalized = normalizeSourceText(html)
          const passage = extractPassageFromNormalized(normalized, query)

          if (passage && normalized.includes(passage)) {
            candidates.push({
              url: pageUrl,
              passage,
              provenance: `Wikipedia: ${pageTitle}`,
              tier: "T2",
              retrieved_at: new Date().toISOString(),
            })
          }
        } catch {
          // If a single page fails, continue with remaining candidates
          continue
        }
      }

      const output = { candidates: candidates.slice(0, request.maxCandidates) }
      return evidenceRetrievalOutputSchema.parse(output)
    } catch (error) {
      if (error instanceof EvidenceError) throw error
      if (controller.signal.aborted) {
        throw new EvidenceError(
          timedOut ? "EVIDENCE_RETRIEVER_TIMEOUT" : "EVIDENCE_RETRIEVER_ABORTED",
          timedOut ? "Evidence retrieval timed out." : "Evidence retrieval was interrupted.",
          true,
          error,
        )
      }
      throw new EvidenceError(
        "EVIDENCE_RETRIEVER_NETWORK_ERROR",
        "Evidence retriever could not be reached.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
