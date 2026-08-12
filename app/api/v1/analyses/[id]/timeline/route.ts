import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { timelineResponseSchema } from "@/lib/contracts/timeline"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"
import { deriveTimelinePoints } from "@/lib/timeline/derive-timeline"
import { getTranscriptForAnalysis } from "@/lib/transcription/transcript-repository"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, analysisId)

  const [state, transcript] = await Promise.all([
    loadPublicAnalysisState(analysisId),
    getTranscriptForAnalysis(analysisId),
  ])
  const points = deriveTimelinePoints(
    (state.assembled?.findings ?? []).map((finding) => ({
      id: finding.id,
      span_refs: finding.span_refs,
    })),
    (transcript?.segments ?? []).map((segment) => ({
      id: segment.id,
      start_ms: segment.startMs,
      end_ms: segment.endMs,
      text: segment.text,
    })),
  )

  return NextResponse.json(timelineResponseSchema.parse({ points }))
})
