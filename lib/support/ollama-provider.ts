import "server-only"

import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import { extractJsonFromModelOutput } from "@/lib/ai/json-extractor"
import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  SupportAssessmentError,
  type SupportAssessmentOutput,
  type SupportAssessmentProvider,
  type SupportAssessmentRequest,
} from "./contracts"

export type OllamaSupportProviderOptions = {
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

type SerializedClaim = {
  claim_id: string
  text: string
  speaker_id: string | null
  span_refs: Array<{
    segment_id: string
    start_char: number
    end_char: number
    text?: string
  }>
}

type SerializedSegment = {
  segment_id: string
  segment_index: number
  low_confidence: boolean
  text: string
}

type SourcePayload = {
  claims?: SerializedClaim[]
  same_speaker_transcript?: SerializedSegment[]
}

function parseSourceBlock(sourceBlock: string): SourcePayload {
  try {
    const firstBrace = sourceBlock.indexOf("{")
    const lastBrace = sourceBlock.lastIndexOf("}")
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonStr = sourceBlock.slice(firstBrace, lastBrace + 1)
      return JSON.parse(jsonStr) as SourcePayload
    }
  } catch {
    // fallback if unparseable
  }
  return {}
}

function buildSystemPrompt(): string {
  return [
    "You are a speaker support assessment system for structured debate analysis.",
    "Given a speaker's transcript segments and a list of claims made by that speaker, evaluate whether the speaker explicitly supplied evidence, data, citations, or reasoning in their transcript segments to support each claim.",
    "",
    "Rules:",
    "- Evaluate ONLY what the speaker explicitly stated in the provided transcript segments. Never use external knowledge or judge real-world truth.",
    "- 'present': The speaker explicitly articulated specific data, citations, studies, numbers, or direct reasoning supporting the claim in their words. evidence_spans must contain at least 1 exact quote.",
    "- 'weak': The speaker provided related or incomplete reasoning, but lacks full proof. evidence_spans must contain at least 1 exact quote.",
    "- 'absent': The speaker simply asserted the claim without providing supporting evidence or data in these segments. evidence_spans MUST be empty [].",
    "- 'insufficient': State is uncertain due to ambiguous interpretation. support_level must be null and evidence_spans empty [].",
    "",
    "Formatting Requirements:",
    "- You MUST return exactly one assessment for every input claim.",
    "- Preserve the exact claim_id from the input.",
    "- evidence_spans text MUST be an exact substring from the speaker transcript segments.",
    "",
    "Return ONLY valid JSON matching this schema:",
    JSON.stringify({
      assessments: [
        {
          claim_id: "claim-uuid",
          state: "ok",
          support_level: "present",
          evidence_spans: [
            {
              segment_id: "segment-uuid",
              text: "exact quote from segment that provides the evidence",
            },
          ],
          assessment_confidence: 0.95,
          reason_code: "explicit_support",
        },
      ],
    }),
  ].join("\n")
}

function buildUserContent(
  claims: SerializedClaim[],
  segments: SerializedSegment[],
  request: SupportAssessmentRequest,
): string {
  const segmentLines = segments
    .map((s) => `[Segment ${s.segment_index ?? 0}] (ID: ${s.segment_id}): "${s.text}"`)
    .join("\n")

  const claimLines = claims
    .map((c, i) => `[Claim ${i}] (ID: ${c.claim_id}): "${c.text}"`)
    .join("\n")

  return [
    `Prompt version: ${request.promptVersion}. Schema version: ${request.schemaVersion}.`,
    `Assess no more than ${request.maxClaims} claims.`,
    "",
    "SPEAKER TRANSCRIPT SEGMENTS:",
    segmentLines,
    "",
    "CLAIMS TO ASSESS:",
    claimLines,
    "",
    "Evaluate whether each claim has explicit support, weak support, or absent support in the speaker's statements above.",
  ].join("\n")
}

export class OllamaSupportAssessmentProvider implements SupportAssessmentProvider {
  constructor(private readonly options: OllamaSupportProviderOptions) {}

  async assess(request: SupportAssessmentRequest, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Ollama support assessment timed out"))
    }, this.options.timeoutMs)

    try {
      const _reqStart = pipelineNow()
      pipelineLog("S3", "PROVIDER", "Sending Ollama request", {
        model: this.options.model,
        numCtx: this.options.numCtx,
        numGpu: this.options.numGpu,
      })

      const payload = parseSourceBlock(request.sourceBlock)
      const inputClaims = payload.claims ?? []
      const inputSegments = payload.same_speaker_transcript ?? []
      const segmentMap = new Map(inputSegments.map((s) => [s.segment_id, s]))

      const systemPrompt = buildSystemPrompt()
      const userContent = buildUserContent(inputClaims, inputSegments, request)

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
            num_predict: 2048,
            temperature: 0.1,
            repeat_penalty: 1.15,
          },
        }),
        signal: controller.signal,
      })

      pipelineLog("S3", "PROVIDER", "Ollama response received", {
        status: response.status,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        if (response.status === 404) {
          throw new SupportAssessmentError(
            "SUPPORT_PROVIDER_REQUEST_REJECTED",
            `Ollama model "${this.options.model}" not found. Pull it with: ollama pull ${this.options.model}`,
            false,
          )
        }
        throw new SupportAssessmentError(
          "SUPPORT_PROVIDER_UNAVAILABLE",
          `Ollama returned HTTP ${response.status}: ${errorText}`,
          response.status >= 500,
        )
      }

      const body = (await response.json()) as OllamaChatResponse
      const outputText = body.message?.content?.trim() ?? ""

      pipelineLog("S3", "PROVIDER", "Ollama inference stats", {
        promptTokens: body.prompt_eval_count,
        evalTokens: body.eval_count,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!outputText) {
        throw new SupportAssessmentError(
          "SUPPORT_PROVIDER_INCOMPLETE",
          "Ollama returned an empty response.",
          true,
        )
      }

      let parsed: unknown
      try {
        const jsonStr = extractJsonFromModelOutput(outputText)
        parsed = JSON.parse(jsonStr)
      } catch (error) {
        throw new SupportAssessmentError(
          "SUPPORT_PROVIDER_INVALID_JSON",
          "Ollama returned invalid JSON.",
          true,
          error,
        )
      }

      // Reconcile and normalize assessments against input claims and segments
      // to guarantee strict compatibility with assertCompatibleAssessment
      const rawAssessments =
        typeof parsed === "object" &&
        parsed !== null &&
        "assessments" in parsed &&
        Array.isArray((parsed as Record<string, unknown>).assessments)
          ? ((parsed as Record<string, unknown>).assessments as Array<Record<string, unknown>>)
          : []

      const rawByClaimId = new Map(
        rawAssessments
          .filter((a) => typeof a.claim_id === "string")
          .map((a) => [a.claim_id as string, a]),
      )

      const finalAssessments: SupportAssessmentOutput["assessments"] = []

      for (const [claimIndex, claim] of inputClaims.entries()) {
        // Find assessment by exact claim_id match or by array index fallback
        let raw = rawByClaimId.get(claim.claim_id)
        if (!raw && rawAssessments[claimIndex]) {
          raw = rawAssessments[claimIndex]
        }

        if (!raw) {
          // If model missed a claim, default to absent support
          finalAssessments.push({
            claim_id: claim.claim_id,
            state: "ok",
            support_level: "absent",
            evidence_spans: [],
            assessment_confidence: 0.8,
            reason_code: "no_support_found",
          })
          continue
        }

        const state = raw.state === "insufficient" ? "insufficient" : "ok"
        const confidence =
          typeof raw.assessment_confidence === "number" && !Number.isNaN(raw.assessment_confidence)
            ? Math.max(0, Math.min(1, raw.assessment_confidence))
            : 0.85

        if (state === "insufficient") {
          finalAssessments.push({
            claim_id: claim.claim_id,
            state: "insufficient",
            support_level: null,
            evidence_spans: [],
            assessment_confidence: confidence,
            reason_code: "model_uncertain",
          })
          continue
        }

        // Validate and ground candidate evidence spans
        const rawSpans = Array.isArray(raw.evidence_spans) ? raw.evidence_spans : []
        // Support fallback if model put quote in a top-level string field
        if (rawSpans.length === 0 && typeof raw.quote === "string" && raw.quote.trim().length > 0) {
          rawSpans.push({ text: raw.quote })
        }

        const validSpans: Array<{
          segment_id: string
          start_char: number
          end_char: number
          text: string
        }> = []
        const seenSpanKeys = new Set<string>()

        for (const rawSpan of rawSpans) {
          if (typeof rawSpan !== "object" || rawSpan === null) continue
          let segId = String(rawSpan.segment_id ?? "")
          let segment = segmentMap.get(segId)
          let spanText = typeof rawSpan.text === "string" ? rawSpan.text.trim() : ""

          // If segmentId not found, search all same-speaker segments for spanText
          if (!segment && spanText.length > 0) {
            for (const s of inputSegments) {
              if (!s.low_confidence && s.text.includes(spanText)) {
                segment = s
                segId = s.segment_id
                break
              }
            }
          }

          if (!segment || segment.low_confidence || spanText.length === 0) continue

          const escaped = escapeSourceDelimiters(segment.text).escapedSource
          let start = Number(rawSpan.start_char ?? -1)
          let end = Number(rawSpan.end_char ?? -1)

          if (
            start >= 0 &&
            end > start &&
            end <= segment.text.length &&
            escaped.slice(start, end) === spanText
          ) {
            // Already grounded accurately
          } else {
            const idx = escaped.indexOf(spanText)
            if (idx >= 0 && idx + spanText.length <= segment.text.length) {
              start = idx
              end = idx + spanText.length
            } else {
              continue
            }
          }

          const dedupeKey = `${segId}:${start}:${end}`
          if (seenSpanKeys.has(dedupeKey)) continue
          seenSpanKeys.add(dedupeKey)

          validSpans.push({
            segment_id: segId,
            start_char: start,
            end_char: end,
            text: spanText,
          })
        }

        let supportLevel: "present" | "weak" | "absent" = "absent"
        if (raw.support_level === "present" && validSpans.length > 0) {
          supportLevel = "present"
        } else if (raw.support_level === "weak" && validSpans.length > 0) {
          supportLevel = "weak"
        } else {
          supportLevel = "absent"
        }

        if (supportLevel === "present") {
          finalAssessments.push({
            claim_id: claim.claim_id,
            state: "ok",
            support_level: "present",
            evidence_spans: validSpans,
            assessment_confidence: confidence,
            reason_code: "explicit_support",
          })
        } else if (supportLevel === "weak") {
          finalAssessments.push({
            claim_id: claim.claim_id,
            state: "ok",
            support_level: "weak",
            evidence_spans: validSpans,
            assessment_confidence: confidence,
            reason_code: "limited_support",
          })
        } else {
          finalAssessments.push({
            claim_id: claim.claim_id,
            state: "ok",
            support_level: "absent",
            evidence_spans: [],
            assessment_confidence: confidence,
            reason_code: "no_support_found",
          })
        }
      }

      return { assessments: finalAssessments }
    } catch (error) {
      if (error instanceof SupportAssessmentError) throw error
      if (controller.signal.aborted) {
        throw new SupportAssessmentError(
          timedOut ? "SUPPORT_PROVIDER_TIMEOUT" : "SUPPORT_PROVIDER_ABORTED",
          timedOut ? "Support assessment timed out." : "Support assessment was interrupted.",
          true,
          error,
        )
      }
      throw new SupportAssessmentError(
        "SUPPORT_PROVIDER_NETWORK_ERROR",
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
