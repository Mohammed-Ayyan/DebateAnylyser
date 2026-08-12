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

const wordSchema = z.object({
  word: z.string().min(1),
  punctuated_word: z.string().min(1).optional(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  speaker: z.number().int().nonnegative().optional(),
  speaker_confidence: z.number().min(0).max(1).optional(),
})
const utteranceSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  transcript: z.string(),
  speaker: z.number().int().nonnegative().optional(),
  words: z.array(wordSchema).default([]),
})
const responseSchema = z.object({
  results: z.object({
    channels: z
      .array(
        z.object({
          detected_language: z.string().optional(),
          alternatives: z.array(z.object({ words: z.array(wordSchema).default([]) })).min(1),
        }),
      )
      .min(1),
    utterances: z.array(utteranceSchema).optional(),
  }),
})

type Word = z.infer<typeof wordSchema>
type Utterance = z.infer<typeof utteranceSchema>

export type DeepgramAdapterOptions = {
  apiKey: string
  apiUrl: string
  model: string
  diarizationModel: string
  timeoutMs: number
  asrLowConfidenceThreshold: number
  diarizationLowConfidenceThreshold: number
  fetchImpl?: typeof fetch
}

function average(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined)
  if (present.length === 0) return null
  return present.reduce((sum, value) => sum + value, 0) / present.length
}

function minimum(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined)
  return present.length === 0 ? null : Math.min(...present)
}

function groupWords(words: Word[]): Utterance[] {
  const groups: Utterance[] = []
  for (const word of words) {
    const speaker = word.speaker
    const current = groups.at(-1)
    if (!current || current.speaker !== speaker || current.words.length >= 100) {
      groups.push({
        start: word.start,
        end: word.end,
        transcript: word.punctuated_word ?? word.word,
        speaker,
        words: [word],
      })
    } else {
      current.end = word.end
      current.transcript += ` ${word.punctuated_word ?? word.word}`
      current.words.push(word)
    }
  }
  return groups
}

function mapSegment(
  utterance: Utterance,
  index: number,
  options: DeepgramAdapterOptions,
): TranscriptionSegment {
  const asrConfidence =
    utterance.confidence ?? average(utterance.words.map((word) => word.confidence))
  const diarizationConfidence = minimum(utterance.words.map((word) => word.speaker_confidence))
  const speaker = utterance.speaker ?? utterance.words[0]?.speaker
  return {
    index,
    startMs: Math.round(utterance.start * 1_000),
    endMs: Math.round(utterance.end * 1_000),
    text: utterance.transcript.trim(),
    speakerLabel: speaker === undefined ? null : `Speaker ${speaker + 1}`,
    asrConfidence,
    diarizationConfidence,
    lowConfidence: isLowConfidence(
      asrConfidence,
      diarizationConfidence,
      options.asrLowConfidenceThreshold,
      options.diarizationLowConfidenceThreshold,
    ),
  }
}

function providerError(status: number): TranscriptionError {
  if (status === 401 || status === 403) {
    return new TranscriptionError("ASR_AUTHENTICATION_FAILED", "ASR authentication failed.", false)
  }
  if (status === 400 || status === 404 || status === 415 || status === 422) {
    return new TranscriptionError(
      "ASR_SOURCE_REJECTED",
      "The ASR provider rejected the source.",
      false,
    )
  }
  return new TranscriptionError(
    "ASR_PROVIDER_UNAVAILABLE",
    "The ASR provider is temporarily unavailable.",
    status === 408 || status === 409 || status === 429 || status >= 500,
  )
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly options: DeepgramAdapterOptions) {}

  async transcribe(
    request: MediaTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<TranscriptionOutput> {
    const endpoint = new URL(this.options.apiUrl)
    endpoint.searchParams.set("model", this.options.model)
    endpoint.searchParams.set("diarize_model", this.options.diarizationModel)
    endpoint.searchParams.set("utterances", "true")
    endpoint.searchParams.set("smart_format", "true")
    endpoint.searchParams.set("punctuate", "true")
    endpoint.searchParams.set("detect_language", "true")

    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener("abort", abort, { once: true })
    const timeout = setTimeout(
      () => controller.abort(new Error("ASR request timed out")),
      this.options.timeoutMs,
    )
    try {
      const _reqStart = pipelineNow()
      pipelineLog("S1", "PROVIDER", "Sending request", { model: this.options.model, host: new URL(this.options.apiUrl).hostname })
      const response = await (this.options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: {
          authorization: `Token ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: request.mediaUrl }),
        signal: controller.signal,
      })
      pipelineLog("S1", "PROVIDER", "Response received", { status: response.status, elapsed: pipelineElapsed(_reqStart) })
      if (!response.ok) throw providerError(response.status)
      const parsed = responseSchema.safeParse(await response.json())
      if (!parsed.success) {
        throw new TranscriptionError(
          "ASR_INVALID_RESPONSE",
          "The ASR provider returned an invalid response.",
          true,
          parsed.error,
        )
      }
      const channel = parsed.data.results.channels[0]
      const words = channel.alternatives[0].words
      const utterances = parsed.data.results.utterances?.length
        ? parsed.data.results.utterances
        : groupWords(words)
      const segments = utterances
        .map((utterance, index) => mapSegment(utterance, index, this.options))
        .filter((segment) => segment.text.length > 0)
        .map((segment, index) => ({ ...segment, index }))
      if (segments.length === 0) {
        throw new TranscriptionError(
          "ASR_EMPTY_TRANSCRIPT",
          "No intelligible speech was detected in the source.",
          false,
        )
      }
      const output = transcriptionOutputSchema.safeParse({
        source: "asr",
        language: channel.detected_language ?? null,
        segments,
      })
      if (!output.success) {
        throw new TranscriptionError(
          "ASR_INVALID_RESPONSE",
          "The ASR response did not satisfy the transcript contract.",
          true,
          output.error,
        )
      }
      return output.data
    } catch (error) {
      if (error instanceof TranscriptionError) throw error
      if (controller.signal.aborted) {
        throw new TranscriptionError("ASR_TIMEOUT", "The ASR request timed out.", true, error)
      }
      throw new TranscriptionError(
        "ASR_NETWORK_ERROR",
        "The ASR provider could not be reached.",
        true,
        error,
      )
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
    }
  }
}
