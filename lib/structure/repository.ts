import "server-only"

import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { getClaimFindings, getClaimStageSnapshot } from "@/lib/claims/repository"
import {
  internalStructureFindingSchema,
  structureEdgeSchema,
  type InternalStructureFinding,
  type StageStatus,
  type StructureEdge,
} from "@/lib/contracts/analysis"
import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findingStructures,
  findings,
  findingSpans,
  structureEdges,
  transcripts,
  transcriptSegments,
} from "@/lib/db/schema"
import { getSupportFindings, getSupportStageSnapshot } from "@/lib/support/repository"
import {
  StructureMappingError,
  type PersistedStructureGraph,
  type StructureInput,
  type ValidatedStructureGraph,
} from "./contracts"

export async function loadStructureInput(analysisId: string): Promise<StructureInput> {
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
    throw new StructureMappingError(
      "STRUCTURE_INPUT_NOT_READY",
      "The analysis is not ready for argument structure mapping.",
      false,
    )
  }
  const [claimStage, supportStage] = await Promise.all([
    getClaimStageSnapshot(analysisId),
    getSupportStageSnapshot(analysisId),
  ])
  if (claimStage?.status !== "complete" || supportStage?.status !== "complete") {
    throw new StructureMappingError(
      "STRUCTURE_PREREQUISITES_NOT_READY",
      "Claim extraction and speaker support must complete before structure mapping.",
      false,
    )
  }
  const segments = await getDatabase()
    .select({
      id: transcriptSegments.id,
      index: transcriptSegments.idx,
      text: transcriptSegments.text,
      speakerId: transcriptSegments.speakerId,
      lowConfidence: transcriptSegments.lowConf,
    })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.transcriptId, analysis.transcriptId))
    .orderBy(asc(transcriptSegments.idx))
  return {
    analysisId,
    status: analysis.status,
    claims: await getClaimFindings(analysisId),
    supports: await getSupportFindings(analysisId),
    segments,
  }
}

export async function getStructureFindings(
  analysisId: string,
): Promise<InternalStructureFinding[]> {
  const rows = await getDatabase()
    .select({
      id: findings.id,
      text: findings.text,
      confidenceRaw: findings.confidenceRaw,
      confidenceSignals: findings.confidenceSignals,
      confidenceBand: findings.confidenceBand,
      state: findings.state,
      personInvolved: findings.personInvolved,
      sourceClaimId: findingStructures.sourceClaimId,
      role: findingStructures.role,
      inferred: findingStructures.inferred,
      anchorRole: findingStructures.anchorRole,
      segmentId: findingSpans.segmentId,
      startChar: findingSpans.startChar,
      endChar: findingSpans.endChar,
    })
    .from(findings)
    .innerJoin(findingStructures, eq(findingStructures.findingId, findings.id))
    .innerJoin(findingSpans, eq(findingSpans.findingId, findings.id))
    .where(
      and(
        eq(findings.analysisId, analysisId),
        eq(findings.kind, "structure"),
        eq(findings.producedByStage, "S4"),
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
    internalStructureFindingSchema.parse({
      id: row.id,
      analysis_id: analysisId,
      kind: "structure",
      text: row.text,
      paraphrase: row.inferred,
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
      produced_by_stage: "S4",
      structure: {
        source_claim_id: row.sourceClaimId,
        role: row.role,
        inferred: row.inferred,
        anchor_role: row.anchorRole,
      },
    }),
  )
}

export async function getStructureEdges(analysisId: string): Promise<StructureEdge[]> {
  const rows = await getDatabase()
    .select({
      id: structureEdges.id,
      analysisId: structureEdges.analysisId,
      fromFindingId: structureEdges.fromFindingId,
      toFindingId: structureEdges.toFindingId,
      relation: structureEdges.relation,
    })
    .from(structureEdges)
    .where(eq(structureEdges.analysisId, analysisId))
    .orderBy(asc(structureEdges.id))
  return rows.map((row) =>
    structureEdgeSchema.parse({
      id: row.id,
      analysis_id: row.analysisId,
      from_finding_id: row.fromFindingId,
      to_finding_id: row.toFindingId,
      relation: row.relation,
    }),
  )
}

export async function getStructureStageSnapshot(
  analysisId: string,
  includeUnpublished = false,
): Promise<
  | {
      status: StageStatus
      attempt: number
      findings: InternalStructureFinding[]
      edges: StructureEdge[]
    }
  | undefined
> {
  const [run] = await getDatabase()
    .select({ status: analysisStageRuns.status, attempt: analysisStageRuns.attempt })
    .from(analysisStageRuns)
    .where(and(eq(analysisStageRuns.analysisId, analysisId), eq(analysisStageRuns.stage, "S4")))
    .orderBy(desc(analysisStageRuns.attempt))
    .limit(1)
  if (!run) return undefined
  const readable = run.status === "complete" || includeUnpublished
  return {
    ...run,
    findings: readable ? await getStructureFindings(analysisId) : [],
    edges: readable ? await getStructureEdges(analysisId) : [],
  }
}

export async function persistStructureGraphs(
  analysisId: string,
  graphs: ValidatedStructureGraph[],
  metadata: { promptVersion: string; schemaVersion: string },
): Promise<PersistedStructureGraph> {
  const created = await getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:S4:structure`}, 0))`,
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
      .select({ sourceClaimId: findingStructures.sourceClaimId })
      .from(findings)
      .innerJoin(findingStructures, eq(findingStructures.findingId, findings.id))
      .where(
        and(
          eq(findings.analysisId, analysisId),
          eq(findings.kind, "structure"),
          eq(findings.producedByStage, "S4"),
        ),
      )
    if (existingRows.length > 0) {
      const existingClaimIds = new Set(existingRows.map((row) => row.sourceClaimId))
      if (
        existingClaimIds.size !== claimIds.size ||
        [...existingClaimIds].some((id) => !claimIds.has(id))
      ) {
        throw new StructureMappingError(
          "STRUCTURE_PERSISTENCE_PARTIAL_SET",
          "Persisted structure rows do not cover the complete claim set.",
          false,
        )
      }
      return false
    }

    const graphClaimIds = new Set(graphs.map((graph) => graph.claimId))
    if (
      graphClaimIds.size !== graphs.length ||
      graphClaimIds.size !== claimIds.size ||
      [...graphClaimIds].some((id) => !claimIds.has(id)) ||
      graphs.some((graph) => graph.nodes.length === 0)
    ) {
      throw new StructureMappingError(
        "STRUCTURE_PERSISTENCE_CLAIM_MISMATCH",
        "Structure graphs must cover every persisted claim exactly once.",
        false,
      )
    }
    if (graphs.length === 0) return true

    const spans = graphs.flatMap((graph) => graph.nodes.map((node) => node.span))
    const referencedSegmentIds = [...new Set(spans.map((span) => span.segment_id))]
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
      throw new StructureMappingError(
        "STRUCTURE_PERSISTENCE_SPAN_MISMATCH",
        "A structure anchor does not belong to the analysis transcript.",
        false,
      )
    }

    const nodeRows = graphs.flatMap((graph) =>
      graph.nodes.map((node) => ({ graph, node, id: randomUUID() })),
    )
    const nodeIds = new Map(
      nodeRows.map(({ graph, node, id }) => [`${graph.claimId}:${node.tempId}`, id]),
    )
    if (nodeIds.size !== nodeRows.length) {
      throw new StructureMappingError(
        "STRUCTURE_PERSISTENCE_NODE_DUPLICATE",
        "Structure node IDs must be unique within each claim graph.",
        false,
      )
    }

    await tx.insert(findings).values(
      nodeRows.map(({ node, id }) => ({
        id,
        analysisId,
        kind: "structure" as const,
        text: node.text,
        paraphrase: node.inferred,
        confidenceRaw: node.confidence,
        confidenceSignals: {
          prompt_version: metadata.promptVersion,
          schema_version: metadata.schemaVersion,
          inferred: node.inferred,
          ...(node.inferred ? { inference_confidence_multiplier: 0.5 } : {}),
        },
        confidenceBand: node.state === "insufficient" ? ("insufficient" as const) : null,
        state: node.state,
        personInvolved: node.personInvolved,
        producedByStage: "S4" as const,
      })),
    )
    await tx.insert(findingStructures).values(
      nodeRows.map(({ node, id }) => ({
        findingId: id,
        sourceClaimId: node.sourceClaimId,
        role: node.role,
        inferred: node.inferred,
        anchorRole: node.anchorRole,
      })),
    )
    await tx.insert(findingSpans).values(
      nodeRows.map(({ node, id }) => ({
        findingId: id,
        segmentId: node.span.segment_id,
        startChar: node.span.start_char,
        endChar: node.span.end_char,
      })),
    )

    const edgeRows = graphs.flatMap((graph) =>
      graph.edges.map((edge) => {
        const fromFindingId = nodeIds.get(`${graph.claimId}:${edge.fromTempId}`)
        const toFindingId = nodeIds.get(`${graph.claimId}:${edge.toTempId}`)
        if (!fromFindingId || !toFindingId) {
          throw new StructureMappingError(
            "STRUCTURE_PERSISTENCE_EDGE_DANGLING",
            "A structure edge referenced a node outside its claim graph.",
            false,
          )
        }
        return {
          analysisId,
          fromFindingId,
          toFindingId,
          relation: edge.relation,
        }
      }),
    )
    if (edgeRows.length > 0) await tx.insert(structureEdges).values(edgeRows)
    return true
  })
  const [findingsResult, edgesResult] = await Promise.all([
    getStructureFindings(analysisId),
    getStructureEdges(analysisId),
  ])
  return { created, findings: findingsResult, edges: edgesResult }
}
