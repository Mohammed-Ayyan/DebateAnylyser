import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import type { InternalClaimFinding, SupportReasonCode } from "@/lib/contracts/analysis"
import {
  SupportAssessmentError,
  supportAssessmentOutputSchema,
  type SupportAssessmentOutput,
  type SupportInput,
  type SupportTranscriptSegment,
  type ValidatedSupport,
} from "./contracts"

export type SupportCall = {
  claims: InternalClaimFinding[]
  segments: SupportTranscriptSegment[]
  coverageComplete: boolean
  source: string
}

export const SUPPORT_RATIONALES: Record<SupportReasonCode, string> = {
  explicit_support: "The speaker provided explicit support for this claim in the transcript.",
  limited_support:
    "The speaker provided related support, but its connection or completeness is limited in this transcript.",
  no_support_found: "No attributable support was found for this claim in the examined transcript.",
  speaker_unattributed:
    "Speaker attribution is unavailable, so speaker-provided support cannot be assessed.",
  attribution_uncertain:
    "Transcript or speaker attribution is uncertain, so support cannot be assessed reliably.",
  context_incomplete: "The complete attributable speaker context could not be examined reliably.",
  model_uncertain: "The available transcript is insufficient for a reliable support assessment.",
}

function sourceLowConfidence(claim: InternalClaimFinding): boolean {
  return claim.confidence?.signals?.source_low_confidence === true
}

function insufficient(
  claim: InternalClaimFinding,
  reasonCode: SupportReasonCode,
): ValidatedSupport {
  return {
    claimId: claim.id,
    supportLevel: null,
    state: "insufficient",
    reasonCode,
    rationale: SUPPORT_RATIONALES[reasonCode],
    spans: claim.span_refs,
    assessmentConfidence: null,
    personInvolved: claim.person_involved,
    coverageComplete: false,
    sourceLowConfidence: sourceLowConfidence(claim),
  }
}

function serializeCall(
  claims: InternalClaimFinding[],
  segments: SupportTranscriptSegment[],
): string {
  return JSON.stringify({
    claims: claims.map((claim) => ({
      claim_id: claim.id,
      text: claim.text,
      speaker_id: claim.claim.speaker_id,
      span_refs: claim.span_refs,
    })),
    same_speaker_transcript: segments.map((segment) => ({
      segment_id: segment.id,
      segment_index: segment.index,
      low_confidence: segment.lowConfidence,
      text: segment.text,
    })),
  })
}

export function prepareSupportCalls(
  input: SupportInput,
  maxContextChars: number,
  maxClaimsPerCall: number,
): { calls: SupportCall[]; deterministic: ValidatedSupport[] } {
  const deterministic: ValidatedSupport[] = []
  const eligibleBySpeaker = new Map<string, InternalClaimFinding[]>()
  for (const claim of input.claims) {
    if (!claim.claim.speaker_id) {
      deterministic.push(insufficient(claim, "speaker_unattributed"))
    } else if (sourceLowConfidence(claim)) {
      deterministic.push(insufficient(claim, "attribution_uncertain"))
    } else {
      const claims = eligibleBySpeaker.get(claim.claim.speaker_id) ?? []
      claims.push(claim)
      eligibleBySpeaker.set(claim.claim.speaker_id, claims)
    }
  }

  const calls: SupportCall[] = []
  const hasUncertainCoverage = input.segments.some(
    (segment) => segment.speakerId === null || segment.lowConfidence,
  )
  for (const [speakerId, claims] of eligibleBySpeaker) {
    const segments = input.segments.filter((segment) => segment.speakerId === speakerId)
    const contextLength = segments.reduce((total, segment) => total + segment.text.length, 0)
    if (segments.length === 0 || contextLength > maxContextChars) {
      deterministic.push(...claims.map((claim) => insufficient(claim, "context_incomplete")))
      continue
    }
    const coverageComplete = !hasUncertainCoverage
    for (let offset = 0; offset < claims.length; offset += maxClaimsPerCall) {
      const batch = claims.slice(offset, offset + maxClaimsPerCall)
      calls.push({
        claims: batch,
        segments,
        coverageComplete,
        source: serializeCall(batch, segments),
      })
    }
  }
  return { calls, deterministic }
}

function assertCompatibleAssessment(
  assessment: SupportAssessmentOutput["assessments"][number],
): void {
  const valid =
    (assessment.state === "insufficient" &&
      assessment.support_level === null &&
      assessment.evidence_spans.length === 0 &&
      assessment.reason_code === "model_uncertain") ||
    (assessment.state === "ok" &&
      assessment.support_level === "present" &&
      assessment.evidence_spans.length > 0 &&
      assessment.reason_code === "explicit_support") ||
    (assessment.state === "ok" &&
      assessment.support_level === "weak" &&
      assessment.evidence_spans.length > 0 &&
      assessment.reason_code === "limited_support") ||
    (assessment.state === "ok" &&
      assessment.support_level === "absent" &&
      assessment.evidence_spans.length === 0 &&
      assessment.reason_code === "no_support_found")
  if (!valid) {
    throw new SupportAssessmentError(
      "SUPPORT_OUTPUT_INCONSISTENT",
      "A support assessment contained contradictory fields.",
      true,
    )
  }
}

export function validateSupportAssessments(
  candidate: unknown,
  call: SupportCall,
): ValidatedSupport[] {
  const output = supportAssessmentOutputSchema.parse(candidate)
  const claims = new Map(call.claims.map((claim) => [claim.id, claim]))
  if (output.assessments.length !== claims.size) {
    throw new SupportAssessmentError(
      "SUPPORT_CLAIM_COVERAGE_INVALID",
      "Support output must assess every requested claim exactly once.",
      true,
    )
  }
  const seen = new Set<string>()
  const segments = new Map(call.segments.map((segment) => [segment.id, segment]))
  return output.assessments.map((assessment) => {
    const claim = claims.get(assessment.claim_id)
    if (!claim || seen.has(assessment.claim_id)) {
      throw new SupportAssessmentError(
        "SUPPORT_CLAIM_REFERENCE_INVALID",
        "Support output referenced an unknown or duplicate claim.",
        true,
      )
    }
    seen.add(assessment.claim_id)
    assertCompatibleAssessment(assessment)

    if (assessment.state === "insufficient") return insufficient(claim, "model_uncertain")
    if (assessment.support_level === "absent" && !call.coverageComplete) {
      return insufficient(claim, "context_incomplete")
    }

    const spanKeys = new Set<string>()
    const spans = assessment.evidence_spans.map((span) => {
      const segment = segments.get(span.segment_id)
      if (
        !segment ||
        segment.speakerId !== claim.claim.speaker_id ||
        segment.lowConfidence ||
        span.end_char <= span.start_char ||
        span.end_char > segment.text.length
      ) {
        throw new SupportAssessmentError(
          "SUPPORT_SPAN_INVALID",
          "A support span was not reliably attributable to the claim speaker.",
          true,
        )
      }
      const escaped = escapeSourceDelimiters(segment.text).escapedSource
      if (escaped.slice(span.start_char, span.end_char) !== span.text) {
        throw new SupportAssessmentError(
          "SUPPORT_TEXT_NOT_GROUNDED",
          "A support span did not exactly match the transcript.",
          true,
        )
      }
      const key = `${span.segment_id}:${span.start_char}:${span.end_char}`
      if (spanKeys.has(key)) {
        throw new SupportAssessmentError(
          "SUPPORT_SPAN_DUPLICATE",
          "A support assessment repeated the same span.",
          true,
        )
      }
      spanKeys.add(key)
      return {
        segment_id: span.segment_id,
        start_char: span.start_char,
        end_char: span.end_char,
      }
    })

    const reasonCode = assessment.reason_code as SupportReasonCode
    return {
      claimId: claim.id,
      supportLevel: assessment.support_level,
      state: "ok",
      reasonCode,
      rationale: SUPPORT_RATIONALES[reasonCode],
      spans: assessment.support_level === "absent" ? claim.span_refs : spans,
      assessmentConfidence: assessment.assessment_confidence,
      personInvolved: claim.person_involved,
      coverageComplete: call.coverageComplete,
      sourceLowConfidence: sourceLowConfidence(claim),
    }
  })
}
