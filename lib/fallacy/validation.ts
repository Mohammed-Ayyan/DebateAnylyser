import { FALLACY_TAXONOMY, FALLACY_TAXONOMY_VERSION } from "./taxonomy"
import {
  FallacyValidationError,
  fallacyDetectionOutputSchema,
  type FallacyDetectionResult,
  type FallacyTranscriptSegment,
  type ValidateFallacyOptions,
  type ValidatedFallacyFinding,
} from "./contracts"

export const DEFAULT_FALLACY_PRECISION_THRESHOLD = 0.9
export const EMPTY_FALLACY_MESSAGE =
  "No likely fallacies, rhetorical techniques, or misleading/incomplete patterns were identified."
export const LOW_ASR_CAVEAT =
  "This span has low ASR confidence, so the possible pattern may be less reliable."

function assertThreshold(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError("precisionThreshold must be between 0 and 1")
  }
}

function validationError(code: string, message: string, cause?: unknown): FallacyValidationError {
  return new FallacyValidationError(code, message, cause)
}

function exactSpan(
  finding: { start_char: number; end_char: number; text: string },
  segment: FallacyTranscriptSegment,
): string {
  if (finding.end_char <= finding.start_char || finding.end_char > segment.text.length) {
    throw validationError(
      "FALLACY_SPAN_INVALID",
      "A fallacy candidate contained an out-of-range UTF-16 transcript span.",
    )
  }
  const anchoredText = segment.text.slice(finding.start_char, finding.end_char)
  if (anchoredText !== finding.text || anchoredText.trim() === "") {
    throw validationError(
      "FALLACY_TEXT_NOT_GROUNDED",
      "A fallacy candidate did not exactly match its declared UTF-16 transcript span.",
    )
  }
  return anchoredText
}

export function validateFallacyDetection(
  candidate: unknown,
  segments: readonly FallacyTranscriptSegment[],
  options: ValidateFallacyOptions = {},
): FallacyDetectionResult {
  const parsed = fallacyDetectionOutputSchema.safeParse(candidate)
  if (!parsed.success) {
    throw validationError(
      "FALLACY_OUTPUT_INVALID",
      "Fallacy detection output did not match the strict contract.",
      parsed.error,
    )
  }

  const precisionThreshold = options.precisionThreshold ?? DEFAULT_FALLACY_PRECISION_THRESHOLD
  assertThreshold(precisionThreshold)
  const maxFindings = options.maxFindings ?? 50
  if (!Number.isInteger(maxFindings) || maxFindings < 0 || maxFindings > 50) {
    throw new RangeError("maxFindings must be an integer between 0 and 50")
  }
  if (parsed.data.findings.length > maxFindings) {
    throw validationError(
      "FALLACY_LIMIT_EXCEEDED",
      "Fallacy detection output exceeded the configured finding limit.",
    )
  }

  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))
  const accepted: ValidatedFallacyFinding[] = []
  const seen = new Set<string>()

  for (const finding of parsed.data.findings) {
    const segment = segmentsById.get(finding.segment_id)
    if (!segment) {
      throw validationError(
        "FALLACY_SPAN_INVALID",
        "A fallacy candidate referenced a segment outside the supplied transcript.",
      )
    }
    const anchoredText = exactSpan(finding, segment)
    if (finding.person_involved || segment.personInvolved) continue
    if (finding.confidence < precisionThreshold) continue

    const key = `${finding.taxonomy_id}:${finding.segment_id}:${finding.start_char}:${finding.end_char}`
    if (seen.has(key)) continue
    seen.add(key)
    const taxonomy = FALLACY_TAXONOMY[finding.taxonomy_id]
    accepted.push({
      taxonomyId: taxonomy.id,
      taxonomyVersion: FALLACY_TAXONOMY_VERSION,
      category: taxonomy.category,
      possibleType: `Possible ${taxonomy.label}`,
      why: taxonomy.why,
      span: {
        segmentId: segment.id,
        startChar: finding.start_char,
        endChar: finding.end_char,
        text: anchoredText,
      },
      confidenceBand: finding.confidence >= 0.95 ? "high" : "medium",
      caveat: segment.lowConfidence ? LOW_ASR_CAVEAT : null,
      contestable: true,
      personInvolved: false,
    })
  }

  return {
    taxonomyVersion: FALLACY_TAXONOMY_VERSION,
    findings: accepted,
    message: accepted.length === 0 ? EMPTY_FALLACY_MESSAGE : null,
  }
}

export function validateFallacyFindings(
  candidate: unknown,
  segments: readonly FallacyTranscriptSegment[],
  options?: ValidateFallacyOptions,
): readonly ValidatedFallacyFinding[] {
  return validateFallacyDetection(candidate, segments, options).findings
}
