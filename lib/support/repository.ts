import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import {
  internalSupportFindingSchema,
  type InternalSupportFinding,
  type StageStatus,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingSupports,
  findings,
  findingSpans,
  transcripts,
  transcriptSegments,
} from "@/lib/db/schema"
import { getClaimFindings, getClaimStageSnapshot } from "@/lib/claims/repository"
import {
  SupportAssessmentError,
  type PersistedSupportBatch,
  type SupportInput,
  type ValidatedSupport,
} from "./contracts"

export async function loadSupportInput(analysisId: string): Promise<SupportInput> {
  const [analysis] = await getDatabase()
    .select({ id: analyses.id, status: analyses.status })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1)
  if (!analysis || (analysis.status !== "analyzing" && analysis.status !== "partial")) {
    throw new SupportAssessmentError(
      "SUPPORT_INPUT_NOT_READY",
      "The analysis is not ready for speaker support assessment.",
      false,
    )
  }
  const claimStage = await getClaimStageSnapshot(analysisId)
  if (!claimStage || claimStage.status !== "complete") {
    throw new SupportAssessmentError(
      "SUPPORT_CLAIMS_NOT_READY",
      "Claim extraction must complete before support assessment.",
      false,
    )
  }
  const [transcript] = await getDatabase()
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.analysisId, analysisId))
    .limit(1)
  if (!transcript) {
    throw new SupportAssessmentError(
      "SUPPORT_TRANSCRIPT_NOT_READY",
      "The transcript is unavailable for support assessment.",
      false,
    )
  }
  const allSegments = await getDatabase()
    .select({
      id: transcriptSegments.id,
      index: transcriptSegments.idx,
      text: transcriptSegments.text,
      speakerId: transcriptSegments.speakerId,
      lowConfidence: transcriptSegments.lowConf,
    })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, transcript.id))
    .orderBy(asc(transcriptSegments.idx))
  return {
    analysisId,
    status: analysis.status,
    claims: await getClaimFindings(analysisId),
    segments: allSegments,
  }
}

export async function getSupportFindings(analysisId: string): Promise<InternalSupportFinding[]> {
  const rows = await getDatabase()
    .select({
      id: findings.id,
      text: findings.text,
      confidenceRaw: findings.confidenceRaw,
      confidenceSignals: findings.confidenceSignals,
      confidenceBand: findings.confidenceBand,
      state: findings.state,
      personInvolved: findings.personInvolved,
      claimId: findingSupports.claimId,
      supportLevel: findingSupports.supportLevel,
      rationale: findingSupports.rationale,
      reasonCode: findingSupports.reasonCode,
      segmentId: findingSpans.segmentId,
      startChar: findingSpans.startChar,
      endChar: findingSpans.endChar,
    })
    .from(findings)
    .innerJoin(findingSupports, eq(findingSupports.findingId, findings.id))
    .innerJoin(findingSpans, eq(findingSpans.findingId, findings.id))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "support"),
        eq(findings.producedByStage, "S3"),
      ),
    )
    .orderBy(asc(findings.createdAt), asc(findings.id), asc(findingSpans.id))
  const grouped = new Map<string, (typeof rows)[number] & { spans: typeof rows }>()
  for (const row of rows) {
    const current = grouped.get(row.id)
    if (current) current.spans.push(row)
    else grouped.set(row.id, { ...row, spans: [row] })
  }
  return [...grouped.values()].map((row) =>
    internalSupportFindingSchema.parse({
      id: row.id,
      analysis_id: analysisId,
      kind: "support",
      text: row.text,
      paraphrase: false,
      ...(row.confidenceRaw === null
        ? {}
        : {
            confidence: {
              raw: row.confidenceRaw,
              ...(row.confidenceSignals ? { signals: row.confidenceSignals } : {}),
            },
          }),
      confidence_band: row.confidenceBand,
      state: row.state,
      person_involved: row.personInvolved,
      span_refs: row.spans.map((span) => ({
        segment_id: span.segmentId,
        start_char: span.startChar,
        end_char: span.endChar,
      })),
      evidence_refs: [],
      produced_by_stage: "S3",
      support: {
        claim_id: row.claimId,
        support_level: row.supportLevel,
        rationale: row.rationale,
        reason_code: row.reasonCode,
        anchor_role:
          row.supportLevel === "present" || row.supportLevel === "weak"
            ? "support_evidence"
            : "claim_subject",
      },
    }),
  )
}

export async function getSupportStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<
  { status: StageStatus; attempt: number; findings: InternalSupportFinding[] } | undefined
> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S3")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  return {
    ...run,
    findings:
      run.status === "complete" || includeUnpublished ? await getSupportFindings(analysisId) : [],
  }
}

export async function persistSupportAssessments(
  analysisId: string,
  assessments: ValidatedSupport[],
  metadata: { promptVersion: string; schemaVersion: string },
): Promise<PersistedSupportBatch> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S3:support`}, 0))`,
    )
    const claimRows = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "claim"),
          eq(findings.producedByStage, "S2"),
        ),
      )
    const claimIds = new Set(claimRows.map((claim) => claim.id))
    const existingRows = await tx
      .select({ claimId: findingSupports.claimId })
      .from(findings)
      .innerJoin(findingSupports, eq(findingSupports.findingId, findings.id))
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "support"),
          eq(findings.producedByStage, "S3"),
        ),
      )
    if (existingRows.length > 0) {
      const existingClaimIds = new Set(existingRows.map((row) => row.claimId))
      if (
        existingClaimIds.size !== claimIds.size ||
        [...existingClaimIds].some((id) => !claimIds.has(id))
      ) {
        throw new SupportAssessmentError(
          "SUPPORT_PERSISTENCE_PARTIAL_SET",
          "Persisted support rows do not exactly cover the analysis claim set.",
          false,
        )
      }
      return false
    }

    const assessmentIds = new Set(assessments.map((assessment) => assessment.claimId))
    const invalidAssessment = assessments.some(
      (assessment) =>
        assessment.spans.length === 0 ||
        (assessment.state === "insufficient"
          ? assessment.supportLevel !== null || assessment.assessmentConfidence !== null
          : assessment.supportLevel === null || assessment.assessmentConfidence === null),
    )
    if (
      invalidAssessment ||
      assessmentIds.size !== assessments.length ||
      assessmentIds.size !== claimIds.size ||
      [...assessmentIds].some((id) => !claimIds.has(id))
    ) {
      throw new SupportAssessmentError(
        "SUPPORT_PERSISTENCE_CLAIM_MISMATCH",
        "Support assessments violated state, anchor, or exact claim-coverage invariants.",
        false,
      )
    }
    if (assessments.length === 0) return true

    const referencedSegmentIds = [
      ...new Set(
        assessments.flatMap((assessment) => assessment.spans.map((span) => span.segment_id)),
      ),
    ]
    const segmentRows = await tx
      .select({ id: transcriptSegments.id })
      .from(transcriptSegments)
      .innerJoin(transcripts, eq(transcripts.id, transcriptSegments.transcriptId))
      .where(
        and(
          eq(transcripts.analysisId, analysisId),
          inArray(transcriptSegments.id, referencedSegmentIds),
        ),
      )
    if (new Set(segmentRows.map((segment) => segment.id)).size !== referencedSegmentIds.length) {
      throw new SupportAssessmentError(
        "SUPPORT_PERSISTENCE_SPAN_MISMATCH",
        "A support anchor does not belong to the analysis transcript.",
        false,
      )
    }

    const rows = assessments.map((assessment) => ({
      id: randomUUID(),
      analysisId,
      kind: "support" as const,
      text: assessment.rationale,
      paraphrase: false,
      confidenceRaw: assessment.assessmentConfidence,
      confidenceSignals: {
        prompt_version: metadata.promptVersion,
        schema_version: metadata.schemaVersion,
        coverage_complete: assessment.coverageComplete,
        source_low_confidence: assessment.sourceLowConfidence,
      },
      confidenceBand: assessment.state === "insufficient" ? ("insufficient" as const) : null,
      state: assessment.state,
      personInvolved: assessment.personInvolved,
      producedByStage: "S3" as const,
    }))
    await tx.insert(findings).values(rows)
    await tx.insert(findingSupports).values(
      rows.map((row, index) => ({
        findingId: row.id,
        claimId: assessments[index].claimId,
        supportLevel: assessments[index].supportLevel,
        rationale: assessments[index].rationale,
        reasonCode: assessments[index].reasonCode,
      })),
    )
    await tx.insert(findingSpans).values(
      rows.flatMap((row, index) =>
        assessments[index].spans.map((span) => ({
          findingId: row.id,
          segmentId: span.segment_id,
          startChar: span.start_char,
          endChar: span.end_char,
        })),
      ),
    )
    return true
  })
  return { created, findings: await getSupportFindings(analysisId) }
}
