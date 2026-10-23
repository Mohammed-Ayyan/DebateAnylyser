import "server-only"

import { extractJsonFromModelOutput } from "@/lib/ai/json-extractor"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  FallacyDetectionError,
  type FallacyDetectionOutput,
  type FallacyDetectionProvider,
  type FallacyDetectionRequest,
} from "./contracts"
import { FALLACY_TAXONOMY_IDS, FALLACY_TAXONOMY_VERSION, type FallacyTaxonomyId } from "./taxonomy"

export type OllamaFallacyProviderOptions = {
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

type FallacySourcePayload = {
  source_claim?: {
    id: string
    text: string
    claim_type?: string
    spans?: Array<{ segment_id: string; start_char: number; end_char: number }>
  }
  structure?: Array<{
    text: string
    role: string
    inferred: boolean
    spans?: Array<{ segment_id: string; start_char: number; end_char: number }>
  }>
  transcript_segments?: Array<{
    id: string
    text: string
    low_confidence?: boolean
    person_involved?: boolean
  }>
}

function parseSourceBlock(sourceBlock: string): FallacySourcePayload {
  try {
    const firstBrace = sourceBlock.indexOf("{")
    const lastBrace = sourceBlock.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonStr = sourceBlock.slice(firstBrace, lastBrace + 1)
      return JSON.parse(jsonStr) as FallacySourcePayload
    }
  } catch {
    // fallback
  }
  return {}
}

const VALID_TAXONOMY_SET = new Set<string>(FALLACY_TAXONOMY_IDS)

function buildSystemPrompt(maxFindings: number): string {
  return [
    "You are a strict, high-precision fallacy and rhetorical pattern detection system for formal debate analysis.",
    "Your objective is to identify ONLY clear, undeniable logical fallacies or rhetorical manipulations from the fixed taxonomy.",
    "",
    "Permitted taxonomy IDs:",
    FALLACY_TAXONOMY_IDS.map((id) => `- ${id}`).join("\n"),
    "",
    "NEGATIVE CONTROL & HIGH PRECISION RULES (CRITICAL):",
    "1. Do NOT label disagreement, debate rebuttal, strong language, or unsupported claims as a logical fallacy.",
    "2. Do NOT label empirical statistics, technical studies (e.g. from NREL, IEA, IPCC, BLS, government agencies), or scientific data as 'LF_FALSE_CAUSE' or any other fallacy.",
    "3. Only flag 'LF_FALSE_DILEMMA' if the speaker explicitly forces a false dichotomy (e.g., 'Either we do X or disaster strikes; there is no middle path') when obvious third options exist.",
    "4. Only flag 'LF_STRAW_MAN' if the speaker blatantly fabricates or distorts the opponent's stated stance into an absurd caricature that the opponent never said.",
    "5. Only flag 'LF_FALSE_CAUSE' if the speaker asserts a superstition or arbitrary correlation without any mechanism or study (e.g. 'Ice cream sales cause shark attacks'). Never flag published studies or engineering research.",
    "6. framing MUST be 'possible'.",
    "7. Set person_involved=false always.",
    "8. When an argument is reasonable debate discourse or when in doubt, ABSTAIN. An empty findings array [] is expected for good-faith arguments.",
    `- Return at most ${maxFindings} findings.`,
    `- taxonomy_version MUST be '${FALLACY_TAXONOMY_VERSION}'.`,
    "",
    "Format: Return ONLY valid JSON in this exact structure:",
    JSON.stringify({
      taxonomy_version: FALLACY_TAXONOMY_VERSION,
      findings: [
        {
          taxonomy_id: "LF_FALSE_DILEMMA",
          segment_id: "segment-uuid",
          text: "exact quote from segment demonstrating the fallacy",
          framing: "possible",
          person_involved: false,
          confidence: 0.95,
        },
      ],
    }),
  ].join("\n")
}

function buildUserContent(payload: FallacySourcePayload, request: FallacyDetectionRequest): string {
  const segments = payload.transcript_segments ?? []
  const segLines = segments.map((s, i) => `[Segment ${i}] (ID: ${s.id}): "${s.text}"`).join("\n")
  const claimText = payload.source_claim?.text ?? ""
  return [
    `Prompt version: ${request.promptVersion}. Schema version: ${request.schemaVersion}.`,
    claimText ? `Claim under discussion: "${claimText}"` : "",
    "",
    "TRANSCRIPT SEGMENTS TO ANALYZE:",
    segLines,
    "",
    `Identify if any segment contains an unambiguous fallacy from the permitted taxonomy. Return at most ${request.maxFindings} findings, or an empty findings array [] if no clear fallacy exists.`,
  ]
    .filter(Boolean)
    .join("\n")
}

export class OllamaFallacyDetectionProvider implements FallacyDetectionProvider {
  constructor(private readonly options: OllamaFallacyProviderOptions) {}

  async detect(request: FallacyDetectionRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Fallacy detection timed out"))
    }, this.options.timeoutMs)

    try {
      const _reqStart = pipelineNow()
      pipelineLog("S5", "PROVIDER", "Sending Ollama request", {
        model: this.options.model,
        numCtx: this.options.numCtx,
        numGpu: this.options.numGpu,
      })

      const payload = parseSourceBlock(request.sourceBlock)
      const inputSegments = payload.transcript_segments ?? []
      const segmentMap = new Map(inputSegments.map((s) => [s.id, s]))

      const userContent = buildUserContent(payload, request)

      const response = await fetch(`${this.options.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(request.maxFindings),
            },
            {
              role: "user",
              content: userContent,
            },
          ],
          format: "json",
          stream: false,
          options: {
            num_ctx: this.options.numCtx,
            num_gpu: this.options.numGpu,
            num_predict: 1024,
            temperature: 0.1,
            repeat_penalty: 1.15,
          },
        }),
        signal: controller.signal,
      })

      pipelineLog("S5", "PROVIDER", "Response received", {
        status: response.status,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        if (response.status === 404) {
          throw new FallacyDetectionError(
            "FALLACY_PROVIDER_REQUEST_REJECTED",
            `Ollama model "${this.options.model}" not found. Pull it with: ollama pull ${this.options.model}`,
            false,
          )
        }
        throw new FallacyDetectionError(
          "FALLACY_PROVIDER_UNAVAILABLE",
          `Ollama returned HTTP ${response.status}: ${errorText}`,
          response.status >= 500,
        )
      }

      const raw = (await response.json()) as OllamaChatResponse
      const text = raw.message?.content?.trim()
      if (!text) {
        throw new FallacyDetectionError(
          "FALLACY_PROVIDER_INCOMPLETE",
          "Ollama returned an empty response.",
          true,
        )
      }

      let parsed: unknown
      try {
        const jsonStr = extractJsonFromModelOutput(text)
        parsed = JSON.parse(jsonStr)
      } catch (parseErr) {
        throw new FallacyDetectionError(
          "FALLACY_PROVIDER_INVALID_JSON",
          "Ollama returned invalid JSON.",
          true,
          parseErr,
        )
      }

      if (typeof parsed !== "object" || parsed === null) {
        return { taxonomy_version: FALLACY_TAXONOMY_VERSION, findings: [] }
      }

      const p = parsed as Record<string, unknown>
      const rawFindings = Array.isArray(p.findings) ? p.findings : []

      const sanitizedFindings: FallacyDetectionOutput["findings"] = []
      const seen = new Set<string>()

      for (const f of rawFindings) {
        if (typeof f !== "object" || f === null) continue
        const taxonomyId = String(f.taxonomy_id ?? "")
        if (!VALID_TAXONOMY_SET.has(taxonomyId)) continue

        let segId = String(f.segment_id ?? "")
        let segment = segmentMap.get(segId)
        let spanText = typeof f.text === "string" ? f.text.trim() : ""

        // If segId not found, look for spanText in segments
        if (!segment && spanText.length > 0) {
          for (const s of inputSegments) {
            if (s.text.includes(spanText)) {
              segment = s
              segId = s.id
              break
            }
          }
        }

        if (!segment) continue
        if (segment.person_involved) continue

        let start = Number(f.start_char ?? -1)
        let end = Number(f.end_char ?? -1)

        if (
          start >= 0 &&
          end > start &&
          end <= segment.text.length &&
          segment.text.slice(start, end) === spanText
        ) {
          // Exact slice matches
        } else if (spanText.length > 0) {
          const idx = segment.text.indexOf(spanText)
          if (idx >= 0 && idx + spanText.length <= segment.text.length) {
            start = idx
            end = idx + spanText.length
          } else {
            continue
          }
        } else {
          continue
        }

        // NEGATIVE CONTROL FILTER: If model flagged an empirical study or citation as false cause, reject it
        if (taxonomyId === "LF_FALSE_CAUSE") {
          const lowerText = segment.text.toLowerCase()
          if (
            lowerText.includes("study") ||
            lowerText.includes("report") ||
            lowerText.includes("laboratory") ||
            lowerText.includes("institute") ||
            lowerText.includes("according to") ||
            lowerText.includes("found that")
          ) {
            // Legitimate empirical study reference, not a false cause fallacy
            continue
          }
        }

        const confidence =
          typeof f.confidence === "number" && !Number.isNaN(f.confidence)
            ? Math.max(0, Math.min(1, f.confidence))
            : 0.95

        const dedupeKey = `${taxonomyId}:${segId}:${start}:${end}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)

        // Exact slice from the transcript to satisfy segment.text.slice(start, end) === finding.text
        const exactText = segment.text.slice(start, end)

        sanitizedFindings.push({
          taxonomy_id: taxonomyId as FallacyTaxonomyId,
          segment_id: segId,
          start_char: start,
          end_char: end,
          text: exactText,
          framing: "possible",
          person_involved: false,
          confidence,
        })

        if (sanitizedFindings.length >= request.maxFindings) break
      }

      return {
        taxonomy_version: FALLACY_TAXONOMY_VERSION,
        findings: sanitizedFindings,
      }
    } catch (error) {
      if (error instanceof FallacyDetectionError) throw error
      if (controller.signal.aborted) {
        throw new FallacyDetectionError(
          timedOut ? "FALLACY_PROVIDER_TIMEOUT" : "FALLACY_PROVIDER_ABORTED",
          timedOut ? "Fallacy detection timed out." : "Fallacy detection was interrupted.",
          true,
          error,
        )
      }
      throw new FallacyDetectionError(
        "FALLACY_PROVIDER_NETWORK_ERROR",
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
