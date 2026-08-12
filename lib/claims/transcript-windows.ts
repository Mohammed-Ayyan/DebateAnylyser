import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import {
  ClaimExtractionError,
  claimExtractionOutputSchema,
  type ClaimTranscriptSegment,
  type ValidatedClaim,
} from "./contracts"

export type TranscriptWindow = {
  index: number
  segments: ClaimTranscriptSegment[]
  source: string
}

function serializeWindow(segments: ClaimTranscriptSegment[]): string {
  return JSON.stringify({
    segments: segments.map((segment) => ({
      segment_id: segment.id,
      segment_index: segment.index,
      speaker_label: segment.speakerLabel,
      text: segment.text,
    })),
  })
}

export function buildTranscriptWindows(
  segments: ClaimTranscriptSegment[],
  maxChars: number,
  overlapSegments: number,
): TranscriptWindow[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be positive")
  if (!Number.isInteger(overlapSegments) || overlapSegments < 0) {
    throw new RangeError("overlapSegments must be nonnegative")
  }
  const windows: TranscriptWindow[] = []
  let cursor = 0
  while (cursor < segments.length) {
    let end = cursor
    let characters = 0
    while (end < segments.length) {
      const addition = segments[end].text.length
      if (end > cursor && characters + addition > maxChars) break
      characters += addition
      end += 1
    }
    const selected = segments.slice(cursor, end)
    windows.push({ index: windows.length, segments: selected, source: serializeWindow(selected) })
    if (end >= segments.length) break
    cursor = Math.max(cursor + 1, end - overlapSegments)
  }
  return windows
}

export function validateWindowClaims(
  candidate: unknown,
  window: TranscriptWindow,
  maxClaims: number,
): ValidatedClaim[] {
  const output = claimExtractionOutputSchema.parse(candidate)
  if (output.claims.length > maxClaims) {
    throw new ClaimExtractionError(
      "CLAIM_LIMIT_EXCEEDED",
      "The extraction output exceeded the configured claim limit.",
      true,
    )
  }
  const segments = new Map(window.segments.map((segment) => [segment.id, segment]))
  return output.claims.map((claim) => {
    const segment = segments.get(claim.segment_id)
    if (!segment) {
      throw new ClaimExtractionError(
        "CLAIM_SPAN_INVALID",
        "A claim referenced a segment outside its transcript window.",
        true,
      )
    }
    if (claim.end_char <= claim.start_char || claim.end_char > segment.text.length) {
      throw new ClaimExtractionError(
        "CLAIM_SPAN_INVALID",
        "A claim contained an out-of-range transcript span.",
        true,
      )
    }
    if (claim.paraphrase) {
      throw new ClaimExtractionError(
        "CLAIM_PARAPHRASE_DISABLED",
        "Paraphrased claims are disabled until semantic validation is calibrated.",
        true,
      )
    }
    const escapedText = escapeSourceDelimiters(segment.text).escapedSource
    const escapedAnchor = escapedText.slice(claim.start_char, claim.end_char)
    if (
      claim.text !== escapedAnchor ||
      segment.text.slice(claim.start_char, claim.end_char).trim() === ""
    ) {
      throw new ClaimExtractionError(
        "CLAIM_TEXT_NOT_GROUNDED",
        "A claim did not exactly match its declared transcript span.",
        true,
      )
    }
    return {
      segmentId: segment.id,
      startChar: claim.start_char,
      endChar: claim.end_char,
      text: segment.text.slice(claim.start_char, claim.end_char),
      paraphrase: false,
      claimType: claim.claim_type,
      checkWorthy:
        claim.check_worthy && (claim.claim_type === "factual" || claim.claim_type === "causal"),
      extractionConfidence: claim.extraction_confidence,
      speakerId: segment.speakerId,
      speakerLabel: segment.speakerLabel,
      personInvolved: segment.speakerIsNamedPerson,
      sourceLowConfidence: segment.lowConfidence,
    }
  })
}

export function deduplicateClaims(claims: ValidatedClaim[]): ValidatedClaim[] {
  const seen = new Set<string>()
  return claims.filter((claim) => {
    const key = `${claim.segmentId}:${claim.startChar}:${claim.endChar}:${claim.text
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
