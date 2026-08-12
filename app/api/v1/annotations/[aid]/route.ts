import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  isMeaningfulAnnotation,
  annotationSchema,
  updateAnnotationSchema,
} from "@/lib/annotations/contracts"
import {
  deleteAnnotation,
  toPublicAnnotation,
  updateAnnotation,
} from "@/lib/annotations/repository"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnnotationOwner } from "@/lib/authz/interaction-policy"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

type RouteContext = { params: Promise<{ aid: string }> }

export const PATCH = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { aid } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const owned = await authorizeAnnotationOwner(principal, aid)
  const parsed = updateAnnotationSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    throw new AppError({
      code: "INVALID_ANNOTATION",
      status: 400,
      message: "Annotation changes are invalid.",
      expose: true,
    })
  const merged = {
    note: parsed.data.note === undefined ? owned.annotation.note : parsed.data.note,
    visibility: parsed.data.visibility ?? owned.annotation.visibility,
    highlighted: parsed.data.highlighted ?? owned.annotation.highlighted,
  }
  if (!isMeaningfulAnnotation(merged))
    throw new AppError({
      code: "EMPTY_ANNOTATION",
      status: 400,
      message: "Delete an annotation that no longer contains a note or curation state.",
      expose: true,
    })
  const row = await updateAnnotation(aid, parsed.data)
  return NextResponse.json(annotationSchema.parse(toPublicAnnotation(row)))
})

export const DELETE = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  assertTrustedOrigin(request)
  const { aid } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  await authorizeAnnotationOwner(principal, aid)
  await deleteAnnotation(aid)
  return new NextResponse(null, { status: 204 })
})
