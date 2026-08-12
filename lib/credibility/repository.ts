import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, ne, sql } from "drizzle-orm"

import {
  internalCredibilityFindingSchema,
  type EvidenceSource,
  type InternalCredibilityFinding,
  type StageStatus,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingCredibilities,
  findingEvidence,
  findings,
  sourceCredibilityRatings,
  sources,
} from "@/lib/db/schema"
import { getEvidenceStageSnapshot } from "@/lib/evidence/repository"
import type { CredibilityRating } from "./contracts"
import { deriveCredibilityDisagreement } from "./public-credibility"
import { validateCredibilityProviderOutput } from "./validation"

export class CredibilityStageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(message, { cause })
    this.name = "CredibilityStageError"
  }
}

export type CredibilityInput = {
  analysisId: string
  status: "analyzing" | "partial"
  sources: EvidenceSource[]
}

export type SourceCredibilityAssessment = {
  sourceId: string
  ratings: CredibilityRating[]
}

export type PersistedCredibility = {
  created: boolean
  findings: InternalCredibilityFinding[]
}

export async function loadCredibilityInput(analysisId: string): Promise<CredibilityInput> {
  const [analysis] = await getDatabase()
    .select({ status: analyses.status })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .limit(1)
  if (!analysis || (analysis.status !== "analyzing" && analysis.status !== "partial")) {
    throw new CredibilityStageError(
      "CREDIBILITY_INPUT_NOT_READY",
      "The analysis is not ready for source credibility assessment.",
      false,
    )
  }

  const evidence = await getEvidenceStageSnapshot(analysisId)
  if (!evidence || evidence.status !== "complete") {
    throw new CredibilityStageError(
      "CREDIBILITY_EVIDENCE_NOT_READY",
      "Verified evidence retrieval must complete before source credibility assessment.",
      false,
    )
  }
  return { analysisId, status: analysis.status, sources: evidence.sources }
}

export async function getCredibilityFindings(
  analysisId: string,
): Promise<InternalCredibilityFinding[]> {
  const rows = await getDatabase()
    .select({
      id: findings.id,
      text: findings.text,
      state: findings.state,
      sourceId: findingCredibilities.sourceId,
    })
    .from(findings)
    .innerJoin(findingCredibilities, eq(findingCredibilities.findingId, findings.id))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "credibility"),
        eq(findings.producedByStage, "S7"),
      ),
    )
    .orderBy(asc(findings.createdAt), asc(findings.id))

  return rows.map((row) =>
    internalCredibilityFindingSchema.parse({
      id: row.id,
      analysis_id: analysisId,
      kind: "credibility",
      text: row.text,
      paraphrase: false,
      confidence_band: null,
      state: row.state,
      person_involved: false,
      span_refs: [],
      evidence_refs: [row.sourceId],
      produced_by_stage: "S7",
      credibility: { source_id: row.sourceId },
    }),
  )
}

export async function getCredibilityStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<
  { status: StageStatus; attempt: number; findings: InternalCredibilityFinding[] } | undefined
> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S7")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  return {
    ...run,
    findings:
      run.status === "complete" || includeUnpublished
        ? await getCredibilityFindings(analysisId)
        : [],
  }
}

export async function persistCredibilityAssessments(
  analysisId: string,
  assessments: SourceCredibilityAssessment[],
  stageRunId: string,
): Promise<PersistedCredibility> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S7:credibility`}, 0))`,
    )

    const [completedEvidence] = await tx
      .select({ id: analysisStageRuns.id })
      .from(analysisStageRuns)
      .where(
        and(
          eq(analysisStageRuns.analysisId, analysisId),
          eq(analysisStageRuns.stage, "S6"),
          eq(analysisStageRuns.status, "complete"),
        ),
      )
      .limit(1)
    if (!completedEvidence) {
      throw new CredibilityStageError(
        "CREDIBILITY_EVIDENCE_NOT_READY",
        "Verified evidence retrieval must complete before credibility persistence.",
        false,
      )
    }

    const verifiedRows = await tx
      .selectDistinct({ id: sources.id })
      .from(sources)
      .innerJoin(findingEvidence, eq(findingEvidence.sourceId, sources.id))
      .innerJoin(findings, eq(findings.id, findingEvidence.findingId))
      .where(
        and(
          eq(sources.analysisId, analysisId),
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "claim"),
          eq(sources.resolves, true),
          eq(sources.licensingQuoteVerified, true),
          ne(sources.supportsRelation, "insufficient"),
        ),
      )
    const verifiedIds = new Set(verifiedRows.map((row) => row.id))
    const assessmentIds = new Set(assessments.map((assessment) => assessment.sourceId))
    if (
      assessmentIds.size !== assessments.length ||
      assessmentIds.size !== verifiedIds.size ||
      [...assessmentIds].some((id) => !verifiedIds.has(id))
    ) {
      throw new CredibilityStageError(
        "CREDIBILITY_SOURCE_SET_MISMATCH",
        "Credibility assessments must cover the complete verified source set without filtering.",
        false,
      )
    }

    const validated = assessments.map((assessment) => ({
      sourceId: assessment.sourceId,
      ratings: validateCredibilityProviderOutput({ ratings: assessment.ratings }).ratings,
    }))
    const existingLinks = await tx
      .select({ sourceId: findingCredibilities.sourceId })
      .from(findingCredibilities)
      .innerJoin(findings, eq(findings.id, findingCredibilities.findingId))
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "credibility"),
          eq(findings.producedByStage, "S7"),
        ),
      )
    const existingRatings = await tx
      .select({ sourceId: sourceCredibilityRatings.sourceId })
      .from(sourceCredibilityRatings)
      .innerJoin(sources, eq(sources.id, sourceCredibilityRatings.sourceId))
      .where(eq(sources.analysisId, analysisId))
    const existingLinkIds = new Set(existingLinks.map((row) => row.sourceId))
    const existingRatingIds = new Set(existingRatings.map((row) => row.sourceId))
    if (
      [...existingLinkIds].some((id) => !existingRatingIds.has(id) || !verifiedIds.has(id)) ||
      [...existingRatingIds].some((id) => !existingLinkIds.has(id) || !verifiedIds.has(id))
    ) {
      throw new CredibilityStageError(
        "CREDIBILITY_PERSISTENCE_PARTIAL_SET",
        "Persisted credibility rows are incomplete or reference an unverified source.",
        false,
      )
    }

    const hasExisting = existingLinks.length > 0 || existingRatings.length > 0
    if (!hasExisting) {
      const rated = validated.filter((assessment) => assessment.ratings.length > 0)
      const findingRows = rated.map((assessment) => {
        const disagreement = deriveCredibilityDisagreement(assessment.ratings)
        return {
          finding: {
            id: randomUUID(),
            analysisId,
            kind: "credibility" as const,
            text: disagreement
              ? "Categorical source credibility ratings disagree for this verified source."
              : "Categorical source credibility ratings are available for this verified source.",
            paraphrase: false,
            confidenceRaw: null,
            confidenceSignals: { credibility_disagreement: disagreement },
            confidenceBand: null,
            state: disagreement ? ("contested" as const) : ("ok" as const),
            personInvolved: false,
            producedByStage: "S7" as const,
          },
          sourceId: assessment.sourceId,
          ratings: assessment.ratings,
        }
      })
      if (findingRows.length > 0) {
        await tx.insert(findings).values(findingRows.map((row) => row.finding))
        await tx.insert(findingCredibilities).values(
          findingRows.map((row) => ({
            findingId: row.finding.id,
            sourceId: row.sourceId,
          })),
        )
        await tx.insert(sourceCredibilityRatings).values(
          findingRows.flatMap((row) =>
            row.ratings.map((rating) => ({
              id: randomUUID(),
              sourceId: row.sourceId,
              factor: rating.factor,
              level: rating.level,
              methodProvenance: rating.provenance.method_name,
              raterRef: rating.provenance.rater_reference,
              contested: true,
            })),
          ),
        )
      }
    }

    const [completedRun] = await tx
      .update(analysisStageRuns)
      .set({ status: "complete", finishedAt: new Date(), errorClass: null })
      .where(
        and(
          eq(analysisStageRuns.id, stageRunId),
          eq(analysisStageRuns.analysisId, analysisId),
          eq(analysisStageRuns.stage, "S7"),
          eq(analysisStageRuns.status, "running"),
        ),
      )
      .returning({ id: analysisStageRuns.id })
    if (!completedRun) {
      throw new CredibilityStageError(
        "CREDIBILITY_STAGE_COMPLETION_CONFLICT",
        "Credibility stage status changed before output persistence completed.",
        true,
      )
    }
    return !hasExisting
  })
  return { created, findings: await getCredibilityFindings(analysisId) }
}
