import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import {
  internalClaimFindingSchema,
  type InternalClaimFinding,
  type StageStatus,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingClaims,
  findings,
  findingSpans,
  speakers,
  transcripts,
  transcriptSegments,
} from "@/lib/db/schema"
import {
  ClaimExtractionError,
  type ClaimTranscriptSegment,
  type PersistedClaimBatch,
  type ValidatedClaim,
} from "./contracts"

export type ClaimTranscript = {
  analysisId: string
  transcriptId: string
  segments: ClaimTranscriptSegment[]
}

export async function loadClaimTranscript(analysisId: string): Promise<ClaimTranscript> {
  const [analysis] = await getDatabase()
    .select({ id: analyses.id, status: analyses.status, transcriptId: transcripts.id })
    .from(analyses)
    .leftJoin(transcripts, eq(transcripts.analysisId, analyses.id))
    .where(eq(analyses.id, analysisId))
    .limit(1)
  if (!analysis || analysis.status !== "analyzing" || !analysis.transcriptId) {
    throw new ClaimExtractionError(
      "CLAIM_INPUT_NOT_READY",
      "The transcript is not ready for claim extraction.",
      false,
    )
  }
  const rows = await getDatabase()
    .select({
      id: transcriptSegments.id,
      index: transcriptSegments.idx,
      text: transcriptSegments.text,
      speakerId: speakers.id,
      speakerLabel: speakers.label,
      speakerDisplayName: speakers.displayName,
      speakerIsNamedPerson: speakers.isNamedPerson,
      lowConfidence: transcriptSegments.lowConf,
    })
    .from(transcriptSegments)
    .leftJoin(speakers, eq(speakers.id, transcriptSegments.speakerId))
    .where(eq(transcriptSegments.transcriptId, analysis.transcriptId))
    .orderBy(asc(transcriptSegments.idx))
  if (rows.length === 0) {
    throw new ClaimExtractionError(
      "CLAIM_INPUT_EMPTY",
      "The transcript contains no segments.",
      false,
    )
  }
  return {
    analysisId,
    transcriptId: analysis.transcriptId,
    segments: rows.map((row) => ({
      id: row.id,
      index: row.index,
      text: row.text,
      speakerId: row.speakerId,
      speakerLabel: row.speakerDisplayName ?? row.speakerLabel,
      speakerIsNamedPerson: row.speakerIsNamedPerson ?? false,
      lowConfidence: row.lowConfidence,
    })),
  }
}

export async function getClaimFindings(analysisId: string): Promise<InternalClaimFinding[]> {
  const rows = await getDatabase()
    .select({
      id: findings.id,
      text: findings.text,
      paraphrase: findings.paraphrase,
      confidenceRaw: findings.confidenceRaw,
      confidenceSignals: findings.confidenceSignals,
      confidenceBand: findings.confidenceBand,
      state: findings.state,
      personInvolved: findings.personInvolved,
      segmentId: findingSpans.segmentId,
      startChar: findingSpans.startChar,
      endChar: findingSpans.endChar,
      claimType: findingClaims.claimType,
      checkWorthy: findingClaims.checkWorthy,
      speakerId: findingClaims.speakerId,
      speakerLabel: speakers.label,
      speakerDisplayName: speakers.displayName,
    })
    .from(findings)
    .innerJoin(findingClaims, eq(findingClaims.findingId, findings.id))
    .innerJoin(findingSpans, eq(findingSpans.findingId, findings.id))
    .leftJoin(speakers, eq(speakers.id, findingClaims.speakerId))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "claim"),
        eq(findings.producedByStage, "S2"),
      ),
    )
    .orderBy(asc(findings.createdAt), asc(findings.id))
  return rows.map((row) =>
    internalClaimFindingSchema.parse({
      id: row.id,
      analysis_id: analysisId,
      kind: "claim",
      text: row.text,
      paraphrase: row.paraphrase,
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
      span_refs: [
        {
          segment_id: row.segmentId,
          start_char: row.startChar,
          end_char: row.endChar,
        },
      ],
      evidence_refs: [],
      produced_by_stage: "S2",
      claim: {
        claim_type: row.claimType,
        check_worthy: row.checkWorthy,
        speaker_id: row.speakerId,
        speaker_label: row.speakerDisplayName ?? row.speakerLabel,
      },
    }),
  )
}

export async function getClaimStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<{ status: StageStatus; attempt: number; findings: InternalClaimFinding[] } | undefined> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S2")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  return {
    ...run,
    findings:
      run.status === "complete" || includeUnpublished ? await getClaimFindings(analysisId) : [],
  }
}

export async function persistClaims(
  analysisId: string,
  claims: ValidatedClaim[],
  metadata: { promptVersion: string; schemaVersion: string },
): Promise<PersistedClaimBatch> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S2:claims`}, 0))`,
    )
    const [existing] = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "claim"),
          eq(findings.producedByStage, "S2"),
        ),
      )
      .limit(1)
    if (existing) return false
    if (claims.length === 0) return true

    const rows = claims.map((claim) => ({
      id: randomUUID(),
      analysisId,
      kind: "claim" as const,
      text: claim.text,
      paraphrase: claim.paraphrase,
      confidenceRaw: claim.extractionConfidence,
      confidenceSignals: {
        prompt_version: metadata.promptVersion,
        schema_version: metadata.schemaVersion,
        source_low_confidence: claim.sourceLowConfidence,
      },
      confidenceBand: null,
      state: "ok" as const,
      personInvolved: claim.personInvolved,
      producedByStage: "S2" as const,
    }))
    await tx.insert(findings).values(rows)
    await tx.insert(findingClaims).values(
      rows.map((row, index) => ({
        findingId: row.id,
        claimType: claims[index].claimType,
        checkWorthy: claims[index].checkWorthy,
        speakerId: claims[index].speakerId,
      })),
    )
    await tx.insert(findingSpans).values(
      rows.map((row, index) => ({
        findingId: row.id,
        segmentId: claims[index].segmentId,
        startChar: claims[index].startChar,
        endChar: claims[index].endChar,
      })),
    )
    return true
  })
  return { created, findings: await getClaimFindings(analysisId) }
}
