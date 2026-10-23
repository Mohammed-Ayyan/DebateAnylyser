import "server-only"

import { z } from "zod"

import { pipelineElapsed, pipelineLog, pipelineNow } from "@/lib/observability/pipeline-logger"
import {
  isLowConfidence,
  TranscriptionError,
  transcriptionOutputSchema,
  type MediaTranscriptionRequest,
  type TranscriptionOutput,
  type TranscriptionProvider,
  type TranscriptionSegment,
} from "./contracts"

const whisperSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  speaker: z.union([z.number().int().nonnegative(), z.string()]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  speaker_confidence: z.number().min(0).max(1).optional(),
})

const whisperResponseSchema = z.object({
  language: z.string().optional().nullable(),
  segments: z.array(whisperSegmentSchema),
})

export type WhisperAdapterOptions = {
  apiUrl: string
  timeoutMs: number
  asrLowConfidenceThreshold: number
  diarizationLowConfidenceThreshold: number
  fetchImpl?: typeof fetch
}

function parseSpeakerLabel(speaker: number | string | undefined): string {
  if (speaker === undefined || speaker === null) return "Speaker 1"
  if (typeof speaker === "number") return `Speaker ${speaker + 1}`
  const trimmed = speaker.trim()
  return trimmed.length > 0 ? trimmed : "Speaker 1"
}

export class WhisperTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly options: WhisperAdapterOptions) {}

  async transcribe(
    request: MediaTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<TranscriptionOutput> {
    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort(new Error("Whisper transcription timed out"))
    }, this.options.timeoutMs)

    try {
      const _reqStart = pipelineNow()
      pipelineLog("S1", "PROVIDER", "Sending Whisper request", {
        host: new URL(this.options.apiUrl).hostname,
      })

      const response = await (this.options.fetchImpl ?? fetch)(this.options.apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: request.mediaUrl }),
        signal: controller.signal,
      })

      pipelineLog("S1", "PROVIDER", "Whisper response received", {
        status: response.status,
        elapsed: pipelineElapsed(_reqStart),
      })

      if (!response.ok) {
        if (response.status === 400 || response.status === 422) {
          throw new TranscriptionError(
            "ASR_SOURCE_REJECTED",
            "Whisper service rejected the audio source.",
            false,
          )
        }
        throw new TranscriptionError(
          "ASR_PROVIDER_UNAVAILABLE",
          `Whisper service returned HTTP ${response.status}`,
          response.status >= 500 || response.status === 429,
        )
      }

      const json = await response.json()
      const parsed = whisperResponseSchema.safeParse(json)
      if (!parsed.success) {
        throw new TranscriptionError(
          "ASR_INVALID_RESPONSE",
          "Whisper returned an invalid response structure.",
          true,
          parsed.error,
        )
      }

      const segments: TranscriptionSegment[] = parsed.data.segments
        .map((seg, index) => {
          const asrConfidence = seg.confidence ?? 0.95
          const diarizationConfidence = seg.speaker_confidence ?? 0.9
          return {
            index,
            startMs: Math.round(seg.start * 1000),
            endMs: Math.max(Math.round(seg.start * 1000) + 1, Math.round(seg.end * 1000)),
            text: seg.text.trim(),
            speakerLabel: parseSpeakerLabel(seg.speaker),
            asrConfidence,
            diarizationConfidence,
            lowConfidence: isLowConfidence(
              asrConfidence,
              diarizationConfidence,
              this.options.asrLowConfidenceThreshold,
              this.options.diarizationLowConfidenceThreshold,
            ),
          }
        })
        .filter((seg) => seg.text.length > 0)
        .map((seg, index) => ({ ...seg, index }))

      if (segments.length === 0) {
        throw new TranscriptionError(
          "ASR_EMPTY_TRANSCRIPT",
          "No intelligible speech was detected by Whisper.",
          false,
        )
      }

      const output = transcriptionOutputSchema.safeParse({
        source: "asr",
        language: parsed.data.language ?? "en",
        segments,
      })

      if (!output.success) {
        throw new TranscriptionError(
          "ASR_OUTPUT_INVALID",
          "Whisper transcript output failed schema validation.",
          false,
          output.error,
        )
      }

      return output.data
    } catch (error) {
      if (error instanceof TranscriptionError) throw error
      if (controller.signal.aborted) {
        if (timedOut) {
          throw new TranscriptionError(
            "ASR_TIMEOUT",
            "Whisper transcription request timed out.",
            true,
            error,
          )
        }
        throw new TranscriptionError(
          "ASR_ABORTED",
          "Whisper transcription was aborted.",
          false,
          error,
        )
      }
      throw new TranscriptionError(
        "ASR_PROVIDER_UNAVAILABLE",
        "Could not communicate with local Whisper service.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
