import "server-only"

import { asc, eq, sql } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { analyses, speakers, transcripts, transcriptSegments } from "@/lib/db/schema"
import { transcriptionOutputSchema, type TranscriptionOutput } from "./contracts"

export type PersistedTranscript = { transcriptId: string; created: boolean }

export async function findTranscriptId(analysisId: string): Promise<string | undefined> {
  const [row] = await getDatabase()
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.analysisId, analysisId))
    .limit(1)
  return row?.id
}

export async function persistTranscript(
  analysisId: string,
  candidate: TranscriptionOutput,
): Promise<PersistedTranscript> {
  const output = transcriptionOutputSchema.parse(candidate)
  return getDatabase().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${analysisId}:transcript`}, 0))`,
    )
    const [existing] = await tx
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.analysisId, analysisId))
      .limit(1)
    if (existing) return { transcriptId: existing.id, created: false }

    const [transcript] = await tx
      .insert(transcripts)
      .values({ analysisId, source: output.source, language: output.language })
      .returning({ id: transcripts.id })
    const labels = [
      ...new Set(
        output.segments
          .map((segment) => segment.speakerLabel)
          .filter((label): label is string => label !== null),
      ),
    ]
    const insertedSpeakers = labels.length
      ? await tx
          .insert(speakers)
          .values(labels.map((label) => ({ transcriptId: transcript.id, label })))
          .returning({ id: speakers.id, label: speakers.label })
      : []
    const speakerIds = new Map(insertedSpeakers.map((speaker) => [speaker.label, speaker.id]))

    const rows = output.segments.map((segment) => ({
      transcriptId: transcript.id,
      speakerId: segment.speakerLabel ? speakerIds.get(segment.speakerLabel) : null,
      idx: segment.index,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      asrConf: segment.asrConfidence,
      diarConf: segment.diarizationConfidence,
      lowConf: segment.lowConfidence,
    }))
    for (let offset = 0; offset < rows.length; offset += 500) {
      await tx.insert(transcriptSegments).values(rows.slice(offset, offset + 500))
    }
    await tx
      .update(analyses)
      .set({ language: output.language, updatedAt: new Date() })
      .where(eq(analyses.id, analysisId))
    return { transcriptId: transcript.id, created: true }
  })
}

export async function getTranscriptForAnalysis(analysisId: string) {
  const [transcript] = await getDatabase()
    .select()
    .from(transcripts)
    .where(eq(transcripts.analysisId, analysisId))
    .limit(1)
  if (!transcript) return undefined
  const rows = await getDatabase()
    .select({
      id: transcriptSegments.id,
      index: transcriptSegments.idx,
      startMs: transcriptSegments.startMs,
      endMs: transcriptSegments.endMs,
      text: transcriptSegments.text,
      asrConfidence: transcriptSegments.asrConf,
      diarizationConfidence: transcriptSegments.diarConf,
      lowConfidence: transcriptSegments.lowConf,
      speakerId: speakers.id,
      speakerLabel: speakers.label,
      speakerDisplayName: speakers.displayName,
    })
    .from(transcriptSegments)
    .leftJoin(speakers, eq(speakers.id, transcriptSegments.speakerId))
    .where(eq(transcriptSegments.transcriptId, transcript.id))
    .orderBy(asc(transcriptSegments.idx))
  return { transcript, segments: rows }
}
