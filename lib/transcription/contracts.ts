import { z } from "zod"

export const confidenceValueSchema = z.number().min(0).max(1).nullable()

export const transcriptionSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string().trim().min(1).max(20_000),
  speakerLabel: z.string().trim().min(1).max(100).nullable(),
  asrConfidence: confidenceValueSchema,
  diarizationConfidence: confidenceValueSchema,
  lowConfidence: z.boolean(),
})

export const transcriptionOutputSchema = z
  .object({
    source: z.enum(["asr", "user_supplied"]),
    language: z.string().trim().min(1).max(35).nullable(),
    segments: z.array(transcriptionSegmentSchema).min(1).max(100_000),
  })
  .superRefine((output, context) => {
    output.segments.forEach((segment, index) => {
      if (segment.index !== index) {
        context.addIssue({
          code: "custom",
          path: ["segments", index, "index"],
          message: "Segment indexes must be contiguous and zero-based.",
        })
      }
      if (segment.endMs < segment.startMs) {
        context.addIssue({
          code: "custom",
          path: ["segments", index, "endMs"],
          message: "Segment end must not precede its start.",
        })
      }
      if (output.source === "asr" && segment.speakerLabel === null) {
        context.addIssue({
          code: "custom",
          path: ["segments", index, "speakerLabel"],
          message: "ASR segments require a diarized speaker label.",
        })
      }
    })
  })

export type TranscriptionOutput = z.infer<typeof transcriptionOutputSchema>
export type TranscriptionSegment = z.infer<typeof transcriptionSegmentSchema>

export type MediaTranscriptionRequest = {
  mediaUrl: string
  contentType?: string
}

export interface TranscriptionProvider {
  transcribe(request: MediaTranscriptionRequest, signal?: AbortSignal): Promise<TranscriptionOutput>
}

export class TranscriptionError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(code: string, message: string, retryable: boolean, cause?: unknown) {
    super(message, { cause })
    this.name = "TranscriptionError"
    this.code = code
    this.retryable = retryable
  }
}

export function isLowConfidence(
  asrConfidence: number | null,
  diarizationConfidence: number | null,
  asrThreshold: number,
  diarizationThreshold: number,
): boolean {
  return (
    asrConfidence === null ||
    diarizationConfidence === null ||
    asrConfidence < asrThreshold ||
    diarizationConfidence < diarizationThreshold
  )
}

export type ConfidenceBand = "high" | "medium" | "low" | "insufficient"

export function toConfidenceBand(value: number | null, lowThreshold: number): ConfidenceBand {
  if (value === null) return "insufficient"
  if (value >= 0.9) return "high"
  if (value >= lowThreshold) return "medium"
  return "low"
}
