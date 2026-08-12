import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { getClaimStageSnapshot } from "@/lib/claims/repository"
import {
  internalFallacyFindingSchema,
  type InternalClaimFinding,
  type InternalFallacyFinding,
  type InternalStructureFinding,
  type StageStatus,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingFallacies,
  findings,
  findingSpans,
  speakers,
  transcripts,
  transcriptSegments,
} from "@/lib/db/schema"
import { getStructureStageSnapshot } from "@/lib/structure/repository"
import {
  FallacyDetectionError,
  type FallacyTranscriptSegment,
  type ValidatedFallacyFinding,
} from "./contracts"

export type FallacyInput = {
  analysisId: string
  status: "analyzing" | "partial"
  claims: InternalClaimFinding[]
  structures: InternalStructureFinding[]
  segments: Array<FallacyTranscriptSegment & { index: number }>
}

export type PersistableFallacyFinding = ValidatedFallacyFinding & { sourceClaimId: string }

export type PersistedFallacyBatch = {
  created: boolean
  findings: InternalFallacyFinding[]
}

export async function loadFallacyInput(analysisId: string): Promise<FallacyInput> {
  const [analysis] = await getDatabase()
    .select({ id: analyses.id, status: analyses.status, transcriptId: transcripts.id })
    .from(analyses)
    .leftJoin(transcripts, eq(transcripts.analysisId, analyses.id))
    .where(eq(analyses.id, analysisId))
    .limit(1)
  if (
    !analysis ||
    (analysis.status !== "analyzing" && analysis.status !== "partial") ||
    !analysis.transcriptId
  ) {
    throw new FallacyDetectionError(
      "FALLACY_INPUT_NOT_READY",
      "The analysis is not ready for fallacy detection.",
      false,
    )
  }

  const [claimStage, structureStage] = await Promise.all([
    getClaimStageSnapshot(analysisId),
    getStructureStageSnapshot(analysisId),
  ])
  if (claimStage?.status !== "complete" || structureStage?.status !== "complete") {
    throw new FallacyDetectionError(
      "FALLACY_PREREQUISITES_NOT_READY",
      "Claim extraction and argument structure must complete before fallacy detection.",
      false,
    )
  }

  const rows = await getDatabase()
    .select({
      id: transcriptSegments.id,
      index: transcriptSegments.idx,
      text: transcriptSegments.text,
      lowConfidence: transcriptSegments.lowConf,
      speakerIsNamedPerson: speakers.isNamedPerson,
    })
    .from(transcriptSegments)
    .leftJoin(speakers, eq(speakers.id, transcriptSegments.speakerId))
    .where(eq(transcriptSegments.transcriptId, analysis.transcriptId))
    .orderBy(asc(transcriptSegments.idx))
  if (rows.length === 0) {
    throw new FallacyDetectionError(
      "FALLACY_TRANSCRIPT_NOT_READY",
      "The transcript contains no segments for fallacy detection.",
      false,
    )
  }

  return {
    analysisId,
    status: analysis.status,
    claims: claimStage.findings,
    structures: structureStage.findings,
    segments: rows.map((row) => ({
      id: row.id,
      index: row.index,
      text: row.text,
      lowConfidence: row.lowConfidence,
      personInvolved: row.speakerIsNamedPerson ?? false,
    })),
  }
}

export async function getFallacyFindings(analysisId: string): Promise<InternalFallacyFinding[]> {
  const rows = await getDatabase()
    .select({
      id: findings.id,
      text: findings.text,
      confidenceRaw: findings.confidenceRaw,
      confidenceSignals: findings.confidenceSignals,
      confidenceBand: findings.confidenceBand,
      state: findings.state,
      personInvolved: findings.personInvolved,
      sourceClaimId: findingFallacies.sourceClaimId,
      possibleType: findingFallacies.possibleType,
      taxonomyRef: findingFallacies.taxonomyRef,
      why: findingFallacies.why,
      caveat: findingFallacies.caveat,
      segmentId: findingSpans.segmentId,
      startChar: findingSpans.startChar,
      endChar: findingSpans.endChar,
    })
    .from(findings)
    .innerJoin(findingFallacies, eq(findingFallacies.findingId, findings.id))
    .innerJoin(findingSpans, eq(findingSpans.findingId, findings.id))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "fallacy"),
        eq(findings.producedByStage, "S5"),
      ),
    )
    .orderBy(asc(findings.createdAt), asc(findings.id), asc(findingSpans.id))

  return rows.map((row) =>
    internalFallacyFindingSchema.parse({
      id: row.id,
      analysis_id: analysisId,
      kind: "fallacy",
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
      span_refs: [
        {
          segment_id: row.segmentId,
          start_char: row.startChar,
          end_char: row.endChar,
        },
      ],
      evidence_refs: [],
      produced_by_stage: "S5",
      fallacy: {
        source_claim_id: row.sourceClaimId,
        possible_type: row.possibleType,
        taxonomy_ref: row.taxonomyRef,
        why: row.why,
        caveat: row.caveat,
        contestable: true,
      },
    }),
  )
}

export async function getFallacyStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<
  { status: StageStatus; attempt: number; findings: InternalFallacyFinding[] } | undefined
> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S5")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  return {
    ...run,
    findings:
      run.status === "complete" || includeUnpublished ? await getFallacyFindings(analysisId) : [],
  }
}

export async function persistFallacyFindings(
  analysisId: string,
  stageRunId: string,
  detections: readonly PersistableFallacyFinding[],
  metadata: { promptVersion: string; schemaVersion: string },
): Promise<PersistedFallacyBatch> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S5:fallacy`}, 0))`,
    )

    const [stageRun] = await tx
      .select({ id: analysisStageRuns.id, status: analysisStageRuns.status })
      .from(analysisStageRuns)
      .where(
        and(
          eq(analysisStageRuns.id, stageRunId),
          eq(analysisStageRuns.analysisId, analysisId),
          eq(analysisStageRuns.stage, "S5"),
        ),
      )
      .limit(1)
    if (!stageRun || (stageRun.status !== "running" && stageRun.status !== "complete")) {
      throw new FallacyDetectionError(
        "FALLACY_STAGE_CONFLICT",
        "The S5 stage run changed before fallacy findings could be committed.",
        true,
      )
    }
    if (stageRun.status === "complete") return false

    const [priorCompletion] = await tx
      .select({ id: analysisStageRuns.id })
      .from(analysisStageRuns)
      .where(
        and(
          eq(analysisStageRuns.analysisId, analysisId),
          eq(analysisStageRuns.stage, "S5"),
          eq(analysisStageRuns.status, "complete"),
        ),
      )
      .limit(1)
    if (priorCompletion) {
      const adopted = await tx
        .update(analysisStageRuns)
        .set({ status: "complete", finishedAt: new Date(), errorClass: null })
        .where(and(eq(analysisStageRuns.id, stageRunId), eq(analysisStageRuns.status, "running")))
        .returning({ id: analysisStageRuns.id })
      if (adopted.length !== 1) {
        throw new FallacyDetectionError(
          "FALLACY_STAGE_CONFLICT",
          "The S5 stage run changed while adopting an idempotent completion.",
          true,
        )
      }
      return false
    }

    const existingRows = await tx
      .select({ id: findings.id })
      .from(findings)
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "fallacy"),
          eq(findings.producedByStage, "S5"),
        ),
      )
      .limit(1)
    if (existingRows.length > 0) {
      throw new FallacyDetectionError(
        "FALLACY_PERSISTENCE_PARTIAL_SET",
        "Fallacy rows existed without an atomically completed S5 stage.",
        false,
      )
    }

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
    const claimIds = new Set(claimRows.map((row) => row.id))
    const keys = new Set<string>()
    for (const detection of detections) {
      const key = `${detection.taxonomyId}:${detection.sourceClaimId}:${detection.span.segmentId}:${detection.span.startChar}:${detection.span.endChar}`
      if (
        detection.personInvolved ||
        !claimIds.has(detection.sourceClaimId) ||
        keys.has(key) ||
        detection.span.endChar <= detection.span.startChar
      ) {
        throw new FallacyDetectionError(
          "FALLACY_PERSISTENCE_INVARIANT_FAILED",
          "A fallacy finding violated person, claim, duplicate, or span invariants.",
          false,
        )
      }
      keys.add(key)
    }

    const referencedSegmentIds = [...new Set(detections.map((item) => item.span.segmentId))]
    if (referencedSegmentIds.length > 0) {
      const segmentRows = await tx
        .select({ id: transcriptSegments.id, text: transcriptSegments.text })
        .from(transcriptSegments)
        .innerJoin(transcripts, eq(transcripts.id, transcriptSegments.transcriptId))
        .where(
          and(
            eq(transcripts.analysisId, analysisId),
            inArray(transcriptSegments.id, referencedSegmentIds),
          ),
        )
      const segmentText = new Map(segmentRows.map((row) => [row.id, row.text]))
      const invalidSpan = detections.some((detection) => {
        const text = segmentText.get(detection.span.segmentId)
        if (!text || detection.span.endChar > text.length) return true
        const anchored = text.slice(detection.span.startChar, detection.span.endChar)
        return anchored !== detection.span.text || anchored.trim() === ""
      })
      if (invalidSpan || segmentText.size !== referencedSegmentIds.length) {
        throw new FallacyDetectionError(
          "FALLACY_PERSISTENCE_SPAN_MISMATCH",
          "A fallacy span was not an exact anchor in the analysis transcript.",
          false,
        )
      }
    }

    if (detections.length > 0) {
      const rows = detections.map((detection) => ({
        id: randomUUID(),
        analysisId,
        kind: "fallacy" as const,
        text: detection.span.text,
        paraphrase: false,
        confidenceRaw: null,
        confidenceSignals: {
          prompt_version: metadata.promptVersion,
          schema_version: metadata.schemaVersion,
        },
        confidenceBand: detection.confidenceBand,
        state: "ok" as const,
        personInvolved: false,
        producedByStage: "S5" as const,
      }))
      await tx.insert(findings).values(rows)
      await tx.insert(findingFallacies).values(
        rows.map((row, index) => ({
          findingId: row.id,
          sourceClaimId: detections[index].sourceClaimId,
          possibleType: detections[index].possibleType,
          taxonomyRef: `${detections[index].taxonomyVersion}:${detections[index].taxonomyId}`,
          why: detections[index].why,
          caveat: detections[index].caveat,
        })),
      )
      await tx.insert(findingSpans).values(
        rows.map((row, index) => ({
          findingId: row.id,
          segmentId: detections[index].span.segmentId,
          startChar: detections[index].span.startChar,
          endChar: detections[index].span.endChar,
        })),
      )
    }

    const completed = await tx
      .update(analysisStageRuns)
      .set({ status: "complete", finishedAt: new Date(), errorClass: null })
      .where(and(eq(analysisStageRuns.id, stageRunId), eq(analysisStageRuns.status, "running")))
      .returning({ id: analysisStageRuns.id })
    if (completed.length !== 1) {
      throw new FallacyDetectionError(
        "FALLACY_STAGE_CONFLICT",
        "The S5 stage run changed before fallacy findings could be committed.",
        true,
      )
    }
    return true
  })

  return { created, findings: await getFallacyFindings(analysisId) }
}
