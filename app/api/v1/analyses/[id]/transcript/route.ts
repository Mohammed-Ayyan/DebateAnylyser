import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"
import { toConfidenceBand } from "@/lib/transcription/contracts"
import { getTranscriptForAnalysis } from "@/lib/transcription/transcript-repository"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, analysisId)
  const result = await getTranscriptForAnalysis(analysisId)
  if (!result) {
    throw new AppError({
      code: "TRANSCRIPT_NOT_READY",
      status: 404,
      message: "The transcript is not ready.",
      expose: true,
      retryable: true,
    })
  }
  const speakerMap = new Map<string, { id: string; label: string; display_name: string | null }>()
  for (const segment of result.segments) {
    if (segment.speakerId && segment.speakerLabel) {
      speakerMap.set(segment.speakerId, {
        id: segment.speakerId,
        label: segment.speakerLabel,
        display_name: segment.speakerDisplayName,
      })
    }
  }
  return NextResponse.json({
    transcript: {
      id: result.transcript.id,
      source: result.transcript.source,
      language: result.transcript.language,
      created_at: result.transcript.createdAt,
    },
    speakers: [...speakerMap.values()],
    segments: result.segments.map((segment) => ({
      id: segment.id,
      index: segment.index,
      start_ms: segment.startMs,
      end_ms: segment.endMs,
      text: segment.text,
      speaker_id: segment.speakerId,
      speaker_label: segment.speakerDisplayName ?? segment.speakerLabel,
      asr_confidence: toConfidenceBand(
        segment.asrConfidence,
        serverEnv.ASR_LOW_CONFIDENCE_THRESHOLD,
      ),
      diarization_confidence: toConfidenceBand(
        segment.diarizationConfidence,
        serverEnv.DIARIZATION_LOW_CONFIDENCE_THRESHOLD,
      ),
      low_confidence: segment.lowConfidence,
    })),
  })
})
