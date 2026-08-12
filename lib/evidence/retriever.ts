import "server-only"

import {
  EvidenceError,
  evidenceRetrievalOutputSchema,
  type EvidenceRetriever,
  type EvidenceRetrievalRequest,
} from "./contracts"

export type HttpEvidenceRetrieverOptions = {
  apiUrl: string
  apiKey: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}

function responseError(status: number): EvidenceError {
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

export class HttpEvidenceRetriever implements EvidenceRetriever {
  constructor(private readonly options: HttpEvidenceRetrieverOptions) {
    if (new URL(options.apiUrl).protocol !== "https:") {
      throw new EvidenceError(
        "EVIDENCE_RETRIEVER_URL_UNSAFE",
        "Evidence retriever must use HTTPS.",
        false,
      )
    }
  }

  async retrieve(request: EvidenceRetrievalRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Evidence retrieval timed out"))
    }, this.options.timeoutMs)

    try {
      const response = await (this.options.fetchImpl ?? fetch)(this.options.apiUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          claim_id: request.claimId,
          claim_text: request.claimText,
          max_candidates: request.maxCandidates,
        }),
        redirect: "error",
        signal: controller.signal,
      })
      if (!response.ok) throw responseError(response.status)
      const parsed = evidenceRetrievalOutputSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new EvidenceError(
          "EVIDENCE_RETRIEVER_INVALID_RESPONSE",
          "Evidence retriever returned an invalid candidate envelope.",
          true,
          parsed.error,
        )
      }
      return parsed.data
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
