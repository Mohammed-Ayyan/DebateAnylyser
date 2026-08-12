import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  createAnnotationSchema,
  annotationListSchema,
  annotationSchema,
} from "@/lib/annotations/contracts"
import {
  createAnnotation,
  listAnnotationsForAnalysis,
  toPublicAnnotation,
} from "@/lib/annotations/repository"
import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("C", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)
  const rows = await listAnnotationsForAnalysis(id)
  return NextResponse.json(
    annotationListSchema.parse({ annotations: rows.map(toPublicAnnotation) }),
  )
})

export const POST = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { id } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  await authorizeAnalysisOwner(principal, id)

  const parsed = createAnnotationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new AppError({
      code: "INVALID_ANNOTATION",
      status: 400,
      message: "Annotation must contain a bounded note or explicit curation state.",
      expose: true,
    })
  }
  if (parsed.data.finding_id) {
    const state = await loadPublicAnalysisState(id)
    if (!state.assembled?.findings.some((finding) => finding.id === parsed.data.finding_id)) {
      throw new AppError({
        code: "FINDING_NOT_FOUND",
        status: 404,
        message: "Finding not found in this analysis.",
        expose: true,
      })
    }
  }
  const row = await createAnnotation({
    analysisId: id,
    findingId: parsed.data.finding_id,
    authorId: principal.userId,
    values: {
      note: parsed.data.note,
      visibility: parsed.data.visibility,
      highlighted: parsed.data.highlighted,
    },
  })
  return NextResponse.json(annotationSchema.parse(toPublicAnnotation(row)), { status: 201 })
})
