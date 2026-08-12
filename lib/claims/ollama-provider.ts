import "server-only"

import { escapeSourceDelimiters, SOURCE_CLOSE, SOURCE_OPEN } from "@/lib/ai/content-boundary"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  ClaimExtractionError,
  type ClaimExtractionProvider,
  type ClaimExtractionRequest,
} from "./contracts"

export type OllamaClaimProviderOptions = {
  baseUrl: string
  model: string
  numCtx: number
  numGpu: number
  timeoutMs: number
}

type OllamaChatResponse = {
  message?: { content?: string }
  eval_count?: number
  eval_duration?: number
  prompt_eval_count?: number
}

type ParsedSegment = {
  segment_id: string
  segment_index: number
  speaker_label: string | null
  text: string
}

type ModelClaim = {
  segment_index?: number
  claim_text?: string
  claim_type?: string
  check_worthy?: boolean
  extraction_confidence?: number
}

function buildSystemPrompt(maxClaims: number): string {
  return [
    "You are a claim extraction system. Given numbered transcript segments, identify explicit claims.",
    "",
    "For each claim, return:",
    "- segment_index: the number in brackets [N] where the claim appears",
    '- claim_text: the EXACT substring from that segment containing the claim (copy it precisely, character for character)',
    '- claim_type: one of "factual", "value", "policy", "causal"',
    "- check_worthy: true only if the claim is an externally verifiable factual or causal assertion",
    "- extraction_confidence: a number between 0 and 1",
    "",
    "Rules:",
    "- Only extract explicit claims, not implied ones",
    "- claim_text MUST be an exact substring of the segment text (copy exactly)",
    "- Set paraphrase to false always",
    "- An empty claims array is valid if no clear claims exist",
    `- Return no more than ${maxClaims} claims`,
    "",
    "Return ONLY valid JSON in this format:",
    '{"claims": [{"segment_index": 0, "claim_text": "exact text from segment", "claim_type": "factual", "check_worthy": true, "extraction_confidence": 0.9}]}',
  ].join("\n")
}

function parseSourceBlock(sourceBlock: string): ParsedSegment[] {
  try {
    // The sourceBlock may be wrapped with <<<SOURCE>>>...<<<END>>> delimiters
    // from the stage runner. Strip them to get the raw JSON.
    let raw = sourceBlock
    if (raw.startsWith(SOURCE_OPEN)) {
      raw = raw.slice(SOURCE_OPEN.length)
      if (raw.startsWith("\n")) raw = raw.slice(1)
    }
    if (raw.endsWith(SOURCE_CLOSE)) {
      raw = raw.slice(0, -SOURCE_CLOSE.length)
      if (raw.endsWith("\n")) raw = raw.slice(0, -1)
    }
    const parsed = JSON.parse(raw) as { segments?: ParsedSegment[] }
    if (!parsed.segments || !Array.isArray(parsed.segments)) return []
    return parsed.segments
  } catch {
    return []
  }
}

function buildUserContent(segments: ParsedSegment[]): string {
  const segmentList = segments
    .map((s) => `[${s.segment_index}] "${s.text}"`)
    .join("\n")
  return `Extract claims from these transcript segments:\n\n${segmentList}`
}

export class OllamaClaimExtractionProvider implements ClaimExtractionProvider {
  constructor(private readonly options: OllamaClaimProviderOptions) {}

  async extract(request: ClaimExtractionRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Ollama claim extraction timed out"))
    }, this.options.timeoutMs)

    try {
      // Parse the source block to get segments for post-processing
      const segments = parseSourceBlock(request.sourceBlock)
      if (segments.length === 0) {
        throw new ClaimExtractionError(
          "CLAIM_PROVIDER_INVALID_INPUT",
          "Could not parse transcript segments from source block.",
          false,
        )
      }

      const systemPrompt = buildSystemPrompt(request.maxClaims)
      const userContent = buildUserContent(segments)

      const _reqStart = pipelineNow()
      pipelineLog("S2", "PROVIDER", "Sending Ollama request", {
        model: this.options.model,
        segments: segments.length,
        numCtx: this.options.numCtx,
        numGpu: this.options.numGpu,
      })

      const url = `${this.options.baseUrl}/api/chat`
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          format: "json",
          stream: false,
          options: {
            num_ctx: this.options.numCtx,
            num_gpu: this.options.numGpu,
          },
        }),
        signal: controller.signal,
      })

      pipelineLog("S2", "PROVIDER", "Ollama response received", {
        status: response.status,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new ClaimExtractionError(
            "CLAIM_PROVIDER_REQUEST_REJECTED",
            `Ollama model "${this.options.model}" not found. Pull it with: ollama pull ${this.options.model}`,
            false,
          )
        }
        throw new ClaimExtractionError(
          "CLAIM_PROVIDER_UNAVAILABLE",
          `Ollama returned HTTP ${response.status}.`,
          response.status >= 500,
        )
      }

      const body = (await response.json()) as OllamaChatResponse
      const outputText = body.message?.content ?? ""

      pipelineLog("S2", "PROVIDER", "Ollama inference stats", {
        promptTokens: body.prompt_eval_count,
        evalTokens: body.eval_count,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!outputText) {
        throw new ClaimExtractionError(
          "CLAIM_PROVIDER_INCOMPLETE",
          "Ollama returned an empty response.",
          true,
        )
      }

      // Parse model JSON output
      let modelOutput: { claims?: ModelClaim[] }
      try {
        modelOutput = JSON.parse(outputText) as { claims?: ModelClaim[] }
      } catch {
        throw new ClaimExtractionError(
          "CLAIM_PROVIDER_INVALID_JSON",
          "Ollama returned invalid JSON.",
          true,
        )
      }

      // DETERMINISTIC POST-PROCESSING
      // The model returns segment_index + claim_text. We resolve to exact segment_id,
      // start_char, end_char using the escaped segment text (matching existing validation).
      const rawClaims = modelOutput.claims ?? []
      pipelineLog("S2", "VALIDATION", "Post-processing model claims", {
        modelProposed: rawClaims.length,
      })

      const resolvedClaims: Array<{
        segment_id: string
        start_char: number
        end_char: number
        text: string
        paraphrase: boolean
        claim_type: string
        check_worthy: boolean
        extraction_confidence: number
      }> = []

      let rejected = 0

      for (const raw of rawClaims) {
        // Validate required fields exist
        if (raw.segment_index === undefined || !raw.claim_text || !raw.claim_type) {
          rejected++
          continue
        }

        // Validate claim_type is a valid enum value
        if (!["factual", "value", "policy", "causal"].includes(raw.claim_type)) {
          rejected++
          continue
        }

        // Find the segment by index
        const seg = segments.find((s) => s.segment_index === raw.segment_index)
        if (!seg) {
          rejected++
          continue
        }

        // The existing validation in transcript-windows.ts checks against
        // escapeSourceDelimiters(segment.text).escapedSource. We must compute
        // offsets in the escaped text space.
        const escapedText = escapeSourceDelimiters(seg.text).escapedSource

        // Try exact indexOf on escaped text
        let idx = escapedText.indexOf(raw.claim_text)
        if (idx < 0) {
          // Try trimmed match
          const trimmed = raw.claim_text.trim()
          if (trimmed.length > 0) {
            idx = escapedText.indexOf(trimmed)
          }
        }

        if (idx < 0) {
          // Cannot resolve — discard (no approximation, no hallucination)
          rejected++
          continue
        }

        const matchText = raw.claim_text.trim()
        const matchLen = escapedText.indexOf(matchText) >= 0 ? matchText.length : raw.claim_text.length
        const startChar = escapedText.indexOf(matchText) >= 0
          ? escapedText.indexOf(matchText)
          : idx
        const endChar = startChar + matchLen

        // Verify the resolved span is non-empty and within bounds
        if (endChar <= startChar || endChar > escapedText.length) {
          rejected++
          continue
        }

        // The authoritative text is from the escaped segment (matching what validation expects)
        const text = escapedText.slice(startChar, endChar)
        if (text.trim() === "") {
          rejected++
          continue
        }

        // Clamp extraction_confidence to [0, 1]
        const confidence =
          typeof raw.extraction_confidence === "number"
            ? Math.min(1, Math.max(0, raw.extraction_confidence))
            : 0.5

        resolvedClaims.push({
          segment_id: seg.segment_id,
          start_char: startChar,
          end_char: endChar,
          text,
          paraphrase: false,
          claim_type: raw.claim_type,
          check_worthy: raw.check_worthy ?? false,
          extraction_confidence: confidence,
        })
      }

      pipelineLog("S2", "VALIDATION", "Post-processing complete", {
        resolved: resolvedClaims.length,
        rejected,
      })

      // Return in the format the pipeline expects (raw JSON matching claimExtractionOutputSchema)
      return { claims: resolvedClaims }
    } catch (error) {
      if (error instanceof ClaimExtractionError) throw error
      if (controller.signal.aborted) {
        throw new ClaimExtractionError(
          timedOut ? "CLAIM_PROVIDER_TIMEOUT" : "CLAIM_PROVIDER_ABORTED",
          timedOut ? "Ollama claim extraction timed out." : "Ollama claim extraction was interrupted.",
          true,
          error,
        )
      }
      throw new ClaimExtractionError(
        "CLAIM_PROVIDER_NETWORK_ERROR",
        "Ollama could not be reached.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
