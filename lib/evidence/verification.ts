import { escapeSourceDelimiters } from "@/lib/ai/content-boundary"
import type { InternalClaimFinding } from "@/lib/contracts/analysis"
import {
  EvidenceError,
  evidenceRetrievalOutputSchema,
  evidenceVerificationOutputSchema,
  type EvidenceCandidate,
  type ResolvedEvidenceCandidate,
  type VerifiedEvidence,
} from "./contracts"
import { normalizeSourceText } from "./source-resolver"

export function eligibleEvidenceClaims(claims: InternalClaimFinding[]): InternalClaimFinding[] {
  return claims.filter(
    (claim) =>
      claim.claim.check_worthy &&
      (claim.claim.claim_type === "factual" || claim.claim.claim_type === "causal"),
  )
}

export function parseEvidenceCandidates(
  value: unknown,
  maxCandidates: number,
): EvidenceCandidate[] {
  const output = evidenceRetrievalOutputSchema.parse(value)
  if (output.candidates.length > maxCandidates) {
    throw new EvidenceError(
      "EVIDENCE_CANDIDATE_LIMIT_EXCEEDED",
      "Evidence retriever returned too many candidates.",
      true,
    )
  }
  const seen = new Set<string>()
  return output.candidates.filter((candidate) => {
    const key = `${candidate.url}\u0000${normalizeSourceText(candidate.passage)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function serializeVerificationInput(
  claim: InternalClaimFinding,
  candidate: ResolvedEvidenceCandidate,
): string {
  return JSON.stringify({
    claim: {
      id: claim.id,
      text: claim.text,
      person_involved: claim.person_involved,
    },
    source: {
      url: candidate.finalUrl,
      passage: candidate.passage,
      provenance: candidate.provenance,
      tier: candidate.tier,
    },
  })
}

export function validateEvidenceVerification(
  value: unknown,
  claim: InternalClaimFinding,
  candidate: ResolvedEvidenceCandidate,
): VerifiedEvidence | undefined {
  const output = evidenceVerificationOutputSchema.parse(value)
  if (output.relation === "insufficient") {
    if (output.licensing_quote !== null) {
      throw new EvidenceError(
        "EVIDENCE_VERIFICATION_INCONSISTENT",
        "Insufficient verification cannot include a licensing quote.",
        true,
      )
    }
    return undefined
  }
  if (!output.licensing_quote?.trim()) {
    throw new EvidenceError(
      "EVIDENCE_LICENSING_QUOTE_MISSING",
      "Verified evidence requires an exact licensing quote.",
      true,
    )
  }
  const escapedQuote = output.licensing_quote.replace(/\s+/g, " ").trim()
  const escapedPassage = escapeSourceDelimiters(candidate.passage).escapedSource
  const escapedSource = escapeSourceDelimiters(candidate.sourceText).escapedSource
  const sourceOffset = escapedSource.indexOf(escapedQuote)
  if (!escapedPassage.includes(escapedQuote) || sourceOffset < 0) {
    throw new EvidenceError(
      "EVIDENCE_LICENSING_QUOTE_NOT_GROUNDED",
      "Licensing quote was not found verbatim in the resolved source passage.",
      true,
    )
  }
  const quote = candidate.sourceText.slice(sourceOffset, sourceOffset + escapedQuote.length)
  if (escapeSourceDelimiters(quote).escapedSource !== escapedQuote) {
    throw new EvidenceError(
      "EVIDENCE_LICENSING_QUOTE_NOT_GROUNDED",
      "Licensing quote could not be recovered exactly from the resolved source.",
      true,
    )
  }

  if (claim.person_involved && output.relation === "refutes") {
    return undefined
  }
  return {
    claimId: claim.id,
    url: candidate.finalUrl,
    snippet: quote,
    provenance: candidate.provenance,
    tier: candidate.tier,
    relation: output.relation,
    retrievedAt: new Date(candidate.retrieved_at),
    verificationConfidence: output.confidence,
  }
}

export function deduplicateVerifiedEvidence(items: VerifiedEvidence[]): VerifiedEvidence[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.claimId}\u0000${item.url}\u0000${item.snippet}\u0000${item.relation}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
