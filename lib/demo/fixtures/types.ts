/**
 * Shared types for demo fixtures.
 * These mirror the application's DB/contract shapes but are self-contained
 * so that fixtures can be loaded without importing server-only modules.
 */

export type DemoSpeaker = {
  id: string
  label: string
  displayName: string | null
  isNamedPerson: boolean
}

export type DemoSegment = {
  id: string
  speakerId: string | null
  idx: number
  startMs: number
  endMs: number
  text: string
  lowConf: boolean
}

export type DemoFinding = {
  id: string
  kind: "claim" | "support" | "structure" | "fallacy" | "credibility"
  text: string
  paraphrase: boolean
  confidenceRaw: number | null
  confidenceBand: "high" | "medium" | "low" | "insufficient" | null
  state: "ok" | "insufficient" | "contested"
  personInvolved: boolean
  producedByStage: "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8"
  spanRefs: Array<{ segmentId: string; startChar: number; endChar: number }>
  evidenceRefs: string[]
  claim?: {
    claimType: "factual" | "value" | "policy" | "causal"
    checkWorthy: boolean
    speakerId: string | null
  }
  support?: {
    claimId: string
    supportLevel: "present" | "weak" | "absent" | null
    rationale: string
    reasonCode: string
    anchorRole: "support_evidence" | "claim_subject"
  }
  structure?: {
    sourceClaimId: string
    role: "claim" | "data" | "warrant" | "backing" | "qualifier" | "rebuttal"
    inferred: boolean
    anchorRole: "asserted_content" | "inference_context" | "claim_subject"
  }
  fallacy?: {
    sourceClaimId: string
    possibleType: string
    taxonomyRef: string
    why: string
    caveat: string | null
  }
  credibility?: {
    sourceId: string
  }
}

export type DemoStructureEdge = {
  id: string
  fromFindingId: string
  toFindingId: string
  relation: "supports" | "warrants" | "backs" | "qualifies" | "rebuts"
}

export type DemoStageRun = {
  stage: "S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10"
  status: "pending" | "running" | "complete" | "failed" | "skipped"
  attempt: number
  errorClass: string | null
}

export type DemoOverview = {
  categoricalRead:
    | "external_evidence_available"
    | "transcript_anchored"
    | "limited_coverage"
    | "insufficient"
  distribution: {
    claims: number
    supportPresent: number
    supportWeak: number
    supportAbsent: number
    supportInsufficient: number
    verifiedSources: number
    possiblePatterns: number
  }
  topInsight: string
  explorePointers: Array<{
    findingId: string
    reason: "claim_context" | "speaker_support" | "external_evidence"
  }>
}

export type DemoFixture = {
  slug: string
  title: string
  transcriptPath: string
  language: string
  speakers: DemoSpeaker[]
  segments: DemoSegment[]
  findings: DemoFinding[]
  structureEdges: DemoStructureEdge[]
  stageRuns: DemoStageRun[]
  overview: DemoOverview
}
