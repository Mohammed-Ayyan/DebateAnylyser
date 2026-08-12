import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { sourceSchema, type EvidenceSource, type StageStatus } from "@/lib/contracts/analysis"
import { getClaimFindings, getClaimStageSnapshot } from "@/lib/claims/repository"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingClaims,
  findingEvidence,
  findingSpans,
  findings,
  sourceCredibilityRatings,
  sources,
  transcripts,
  transcriptSegments,
} from "@/lib/db/schema"
import {
  EvidenceError,
  type EvidenceInput,
  type PersistedEvidence,
  type VerifiedEvidence,
} from "./contracts"

function toSource(
  row: typeof sources.$inferSelect,
  ratings: Array<{
    id: string
    factor:
      | "editorial_standards"
      | "ownership_transparency"
      | "corrections_practice"
      | "method_transparency"
      | "source_attribution"
    level: "higher" | "mixed" | "lower"
    methodProvenance: string
    raterRef: string
    contested: boolean
  }> = [],
): EvidenceSource {
  const levelsByFactor = new Map<string, Set<string>>()
  for (const rating of ratings) {
    const levels = levelsByFactor.get(rating.factor) ?? new Set<string>()
    levels.add(rating.level)
    levelsByFactor.set(rating.factor, levels)
  }
  return sourceSchema.parse({
    id: row.id,
    analysis_id: row.analysisId,
    url: row.url,
    retrieved_snippet: row.retrievedSnippet,
    provenance: row.provenance,
    tier: row.tier,
    resolves: row.resolves,
    supports_relation: row.supportsRelation,
    licensing_quote_verified: row.licensingQuoteVerified,
    retrieved_at: row.retrievedAt.toISOString(),
    credibility_ratings: ratings.map((rating) => ({
      id: rating.id,
      factor: rating.factor,
      level: rating.level,
      method_provenance: rating.methodProvenance,
      rater_ref: rating.raterRef,
      contested: rating.contested,
    })),
    credibility_disagreement: [...levelsByFactor.values()].some((levels) => levels.size > 1),
  })
}

async function attachCredibility(
  rows: Array<typeof sources.$inferSelect>,
): Promise<EvidenceSource[]> {
  if (rows.length === 0) return []
  const ratings = await getDatabase()
    .select({
      id: sourceCredibilityRatings.id,
      sourceId: sourceCredibilityRatings.sourceId,
      factor: sourceCredibilityRatings.factor,
      level: sourceCredibilityRatings.level,
      methodProvenance: sourceCredibilityRatings.methodProvenance,
      raterRef: sourceCredibilityRatings.raterRef,
      contested: sourceCredibilityRatings.contested,
    })
    .from(sourceCredibilityRatings)
    .where(
      inArray(
        sourceCredibilityRatings.sourceId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(sourceCredibilityRatings.createdAt), asc(sourceCredibilityRatings.id))
  const bySource = new Map<string, typeof ratings>()
  for (const rating of ratings) {
    bySource.set(rating.sourceId, [...(bySource.get(rating.sourceId) ?? []), rating])
  }
  return rows.map((row) => toSource(row, bySource.get(row.id) ?? []))
}

export async function loadEvidenceInput(analysisId: string): Promise<EvidenceInput> {
  const [analysis] = await getDatabase()
    .select({ status: analyses.status, transcriptId: transcripts.id })
    .from(analyses)
    .leftJoin(transcripts, eq(transcripts.analysisId, analyses.id))
    .where(eq(analyses.id, analysisId))
    .limit(1)
  if (
    !analysis ||
    (analysis.status !== "analyzing" && analysis.status !== "partial") ||
    !analysis.transcriptId
  ) {
    throw new EvidenceError(
      "EVIDENCE_INPUT_NOT_READY",
      "Analysis claims are not ready for evidence retrieval.",
      false,
    )
  }
  const claimStage = await getClaimStageSnapshot(analysisId)
  if (!claimStage || claimStage.status !== "complete") {
    throw new EvidenceError(
      "EVIDENCE_CLAIMS_NOT_READY",
      "Claim extraction must complete before evidence retrieval.",
      false,
    )
  }

  const segmentRows = await getDatabase()
    .select({ id: transcriptSegments.id })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, analysis.transcriptId))
  return {
    analysisId,
    status: analysis.status,
    claims: await getClaimFindings(analysisId),
    validSegmentIds: new Set(segmentRows.map((row) => row.id)),
  }
}

export async function getEvidenceSources(analysisId: string): Promise<EvidenceSource[]> {
  const rows = await getDatabase()
    .selectDistinct({ source: sources })
    .from(sources)
    .innerJoin(findingEvidence, eq(findingEvidence.sourceId, sources.id))
    .innerJoin(findings, eq(findings.id, findingEvidence.findingId))
    .where(
      and(
        eq(sources.analysisId, analysisId),
        eq(findings.analysisId, analysisId),
        eq(sources.resolves, true),
        eq(sources.licensingQuoteVerified, true),
      ),
    )
    .orderBy(asc(sources.retrievedAt), asc(sources.id))
  return attachCredibility(rows.map((row) => row.source))
}

export async function getEvidenceRefsByClaim(analysisId: string): Promise<Map<string, string[]>> {
  const rows = await getDatabase()
    .select({ findingId: findingEvidence.findingId, sourceId: findingEvidence.sourceId })
    .from(findingEvidence)
    .innerJoin(findings, eq(findings.id, findingEvidence.findingId))
    .innerJoin(sources, eq(sources.id, findingEvidence.sourceId))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(sources.analysisId, analysisId),
        eq(findings.kind, "claim"),
        eq(sources.resolves, true),
        eq(sources.licensingQuoteVerified, true),
      ),
    )
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    grouped.set(row.findingId, [...(grouped.get(row.findingId) ?? []), row.sourceId])
  }
  return grouped
}

export async function getEvidenceStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<{ status: StageStatus; attempt: number; sources: EvidenceSource[] } | undefined> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S6")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  return {
    ...run,
    sources:
      run.status === "complete" || includeUnpublished ? await getEvidenceSources(analysisId) : [],
  }
}

export async function persistVerifiedEvidence(
  analysisId: string,
  evidence: VerifiedEvidence[],
  metadata: { promptVersion: string; schemaVersion: string },
  stageRunId: string,
): Promise<PersistedEvidence> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S6:evidence`}, 0))`,
    )
    const [existing] = await tx
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.analysisId, analysisId))
      .limit(1)

    if (!existing) {
      const claimRows = await tx
        .select({
          id: findings.id,
          claimType: findingClaims.claimType,
          checkWorthy: findingClaims.checkWorthy,
        })
        .from(findings)
        .innerJoin(findingClaims, eq(findingClaims.findingId, findings.id))
        .where(
          and(
            eq(findings.analysisId, analysisId),
            eq(findings.kind, "claim"),
            eq(findings.producedByStage, "S2"),
          ),
        )
      const eligibleIds = new Set(
        claimRows
          .filter(
            (claim) =>
              claim.checkWorthy && (claim.claimType === "factual" || claim.claimType === "causal"),
          )
          .map((claim) => claim.id),
      )
      const persistedClaimIds = new Set(claimRows.map((claim) => claim.id))
      if (
        evidence.some(
          (item) =>
            !eligibleIds.has(item.claimId) ||
            !persistedClaimIds.has(item.claimId) ||
            !item.snippet.trim() ||
            item.url.startsWith("https://") === false,
        )
      ) {
        throw new EvidenceError(
          "EVIDENCE_PERSISTENCE_INVARIANT_FAILED",
          "Evidence did not satisfy verified claim and source invariants.",
          false,
        )
      }

      if (evidence.length > 0) {
        const sourceByKey = new Map<string, typeof sources.$inferInsert>()
        for (const item of evidence) {
          const key = `${item.url}\u0000${item.snippet}\u0000${item.relation}`
          if (!sourceByKey.has(key)) {
            sourceByKey.set(key, {
              id: randomUUID(),
              analysisId,
              url: item.url,
              retrievedSnippet: item.snippet,
              provenance: item.provenance,
              tier: item.tier,
              resolves: true,
              supportsRelation: item.relation,
              licensingQuoteVerified: true,
              verificationSignals: {
                confidence: item.verificationConfidence,
                prompt_version: metadata.promptVersion,
                schema_version: metadata.schemaVersion,
              },
              retrievedAt: item.retrievedAt,
            })
          }
        }
        await tx.insert(sources).values([...sourceByKey.values()])
        const links = new Map<string, { findingId: string; sourceId: string }>()
        for (const item of evidence) {
          const key = `${item.url}\u0000${item.snippet}\u0000${item.relation}`
          const sourceId = sourceByKey.get(key)?.id
          if (!sourceId) throw new Error("Evidence source identity was not allocated")
          links.set(`${item.claimId}:${sourceId}`, { findingId: item.claimId, sourceId })
        }
        await tx.insert(findingEvidence).values([...links.values()])
      }
    }

    const [completedRun] = await tx
      .update(analysisStageRuns)
      .set({ status: "complete", finishedAt: new Date(), errorClass: null })
      .where(
        and(
          eq(analysisStageRuns.id, stageRunId),
          eq(analysisStageRuns.analysisId, analysisId),
          eq(analysisStageRuns.stage, "S6"),
          eq(analysisStageRuns.status, "running"),
        ),
      )
      .returning({ id: analysisStageRuns.id })
    if (!completedRun) {
      throw new EvidenceError(
        "EVIDENCE_STAGE_COMPLETION_CONFLICT",
        "Evidence stage status changed before output persistence completed.",
        true,
      )
    }
    return !existing
  })
  return { created, sources: await getEvidenceSources(analysisId) }
}

export async function getEvidenceForFinding(
  analysisId: string,
  findingId: string,
): Promise<
  | {
      sources: EvidenceSource[]
      spans: Array<{ segment_id: string; start_char: number; end_char: number }>
    }
  | undefined
> {
  const [finding] = await getDatabase()
    .select({ id: findings.id })
    .from(findings)
    .where(
      and(
        eq(findings.id, findingId),
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "claim"),
      ),
    )
    .limit(1)
  if (!finding) return undefined
  const [sourceRows, spanRows] = await Promise.all([
    getDatabase()
      .select({ source: sources })
      .from(findingEvidence)
      .innerJoin(sources, eq(sources.id, findingEvidence.sourceId))
      .where(
        and(
          eq(findingEvidence.findingId, findingId),
          eq(sources.analysisId, analysisId),
          eq(sources.resolves, true),
          eq(sources.licensingQuoteVerified, true),
        ),
      )
      .orderBy(asc(sources.retrievedAt), asc(sources.id)),
    getDatabase()
      .select({
        segment_id: findingSpans.segmentId,
        start_char: findingSpans.startChar,
        end_char: findingSpans.endChar,
      })
      .from(findingSpans)
      .where(eq(findingSpans.findingId, findingId))
      .orderBy(asc(findingSpans.id)),
  ])
  return {
    sources: await attachCredibility(sourceRows.map((row) => row.source)),
    spans: spanRows,
  }
}
