import "server-only"

import { getDatabase } from "@/lib/db/client"
import {
  analyses,
  analysisStageRuns,
  findings,
  findingClaims,
  findingFallacies,
  findingSpans,
  findingStructures,
  findingSupports,
  speakers,
  structureEdges,
  transcriptSegments,
  transcripts,
} from "@/lib/db/schema"
import type { DemoFixture } from "./fixtures/types"

/**
 * Persists a precomputed demo fixture into the existing database schema.
 * Creates analysis, transcript, segments, findings, and stage runs.
 * Returns the analysis ID for navigation.
 */
export async function persistDemoFixture(
  ownerId: string,
  fixture: DemoFixture,
): Promise<{ analysisId: string }> {
  const db = getDatabase()

  return db.transaction(async (tx) => {
    // 1. Create the analysis record
    const [analysis] = await tx
      .insert(analyses)
      .values({
        ownerId,
        sourceType: "paste",
        sourceMediaKey: null,
        sourceUrl: null,
        sourceRetrievalMethod: null,
        title: fixture.title,
        status: "complete",
        rightsCheckResult: "passed",
        rightsBlockReason: null,
        retentionSetting: "keep",
        language: fixture.language,
      })
      .returning({ id: analyses.id })

    const analysisId = analysis.id

    // 2. Create transcript
    const [transcript] = await tx
      .insert(transcripts)
      .values({
        analysisId,
        source: "user_supplied",
        language: fixture.language,
      })
      .returning({ id: transcripts.id })

    const transcriptId = transcript.id

    // 3. Create speakers (map fixture IDs to DB IDs)
    const speakerIdMap = new Map<string, string>()
    for (const speaker of fixture.speakers) {
      const [dbSpeaker] = await tx
        .insert(speakers)
        .values({
          transcriptId,
          label: speaker.label,
          displayName: speaker.displayName,
          isNamedPerson: speaker.isNamedPerson,
        })
        .returning({ id: speakers.id })
      speakerIdMap.set(speaker.id, dbSpeaker.id)
    }

    // 4. Create transcript segments (map fixture IDs to DB IDs)
    const segmentIdMap = new Map<string, string>()
    for (const segment of fixture.segments) {
      const dbSpeakerId = segment.speakerId ? (speakerIdMap.get(segment.speakerId) ?? null) : null
      const [dbSegment] = await tx
        .insert(transcriptSegments)
        .values({
          transcriptId,
          speakerId: dbSpeakerId,
          idx: segment.idx,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          lowConf: segment.lowConf,
        })
        .returning({ id: transcriptSegments.id })
      segmentIdMap.set(segment.id, dbSegment.id)
    }

    // 5. Create findings (map fixture IDs to DB IDs)
    const findingIdMap = new Map<string, string>()
    for (const finding of fixture.findings) {
      const [dbFinding] = await tx
        .insert(findings)
        .values({
          analysisId,
          kind: finding.kind,
          text: finding.text,
          paraphrase: finding.paraphrase,
          confidenceRaw: finding.confidenceRaw,
          confidenceBand: finding.confidenceBand,
          state: finding.state,
          personInvolved: finding.personInvolved,
          producedByStage: finding.producedByStage,
        })
        .returning({ id: findings.id })
      findingIdMap.set(finding.id, dbFinding.id)

      // Create span refs
      for (const span of finding.spanRefs) {
        const dbSegmentId = segmentIdMap.get(span.segmentId)
        if (!dbSegmentId) continue
        await tx.insert(findingSpans).values({
          findingId: dbFinding.id,
          segmentId: dbSegmentId,
          startChar: span.startChar,
          endChar: span.endChar,
        })
      }
    }

    // 6. Create finding detail tables (claims, support, structure, fallacy)
    for (const finding of fixture.findings) {
      const dbFindingId = findingIdMap.get(finding.id)
      if (!dbFindingId) continue

      if (finding.claim) {
        const dbSpeakerId = finding.claim.speakerId
          ? (speakerIdMap.get(finding.claim.speakerId) ?? null)
          : null
        await tx.insert(findingClaims).values({
          findingId: dbFindingId,
          claimType: finding.claim.claimType,
          checkWorthy: finding.claim.checkWorthy,
          speakerId: dbSpeakerId,
        })
      }

      if (finding.support) {
        const dbClaimId = findingIdMap.get(finding.support.claimId)
        if (dbClaimId) {
          await tx.insert(findingSupports).values({
            findingId: dbFindingId,
            claimId: dbClaimId,
            supportLevel: finding.support.supportLevel,
            rationale: finding.support.rationale,
            reasonCode: finding.support.reasonCode,
          })
        }
      }

      if (finding.structure) {
        const dbSourceClaimId = findingIdMap.get(finding.structure.sourceClaimId)
        if (dbSourceClaimId) {
          await tx.insert(findingStructures).values({
            findingId: dbFindingId,
            sourceClaimId: dbSourceClaimId,
            role: finding.structure.role,
            inferred: finding.structure.inferred,
            anchorRole: finding.structure.anchorRole,
          })
        }
      }

      if (finding.fallacy) {
        const dbSourceClaimId = findingIdMap.get(finding.fallacy.sourceClaimId)
        if (dbSourceClaimId) {
          await tx.insert(findingFallacies).values({
            findingId: dbFindingId,
            sourceClaimId: dbSourceClaimId,
            possibleType: finding.fallacy.possibleType,
            taxonomyRef: finding.fallacy.taxonomyRef,
            why: finding.fallacy.why,
            caveat: finding.fallacy.caveat,
          })
        }
      }
    }

    // 7. Create structure edges
    for (const edge of fixture.structureEdges) {
      const fromId = findingIdMap.get(edge.fromFindingId)
      const toId = findingIdMap.get(edge.toFindingId)
      if (fromId && toId) {
        await tx.insert(structureEdges).values({
          analysisId,
          fromFindingId: fromId,
          toFindingId: toId,
          relation: edge.relation,
        })
      }
    }

    // 8. Create stage runs
    const now = new Date()
    for (const run of fixture.stageRuns) {
      await tx.insert(analysisStageRuns).values({
        analysisId,
        stage: run.stage,
        status: run.status,
        attempt: run.attempt,
        startedAt: now,
        finishedAt: now,
        errorClass: run.errorClass,
      })
    }

    return { analysisId }
  })
}
