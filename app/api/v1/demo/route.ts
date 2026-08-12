import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { findActiveUserById } from "@/lib/auth/identity-repository"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { getDemoFixture, isDemoTranscript } from "@/lib/demo/fixtures"
import { persistDemoFixture } from "@/lib/demo/persist"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"

/**
 * POST /api/v1/demo
 *
 * Creates a precomputed demo analysis from a fixture.
 * Does NOT call any real providers — fixture data is persisted directly.
 *
 * Body: { slug: "debate-demo-1" | "debate-demo-2" }
 * Returns: { id: string, status: "complete" }
 */
export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || typeof (body as { slug?: unknown }).slug !== "string") {
    throw new AppError({
      code: "INVALID_REQUEST",
      status: 400,
      message: "A valid demo slug is required.",
      expose: true,
    })
  }

  const slug = (body as { slug: string }).slug
  if (!isDemoTranscript(slug)) {
    throw new AppError({
      code: "INVALID_REQUEST",
      status: 400,
      message: `Unknown demo transcript: ${slug}`,
      expose: true,
    })
  }

  const user = await findActiveUserById(principal.userId)
  if (!user) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Account not found.",
      expose: true,
    })
  }

  const fixture = getDemoFixture(slug)
  if (!fixture) {
    throw new AppError({
      code: "INTERNAL",
      status: 500,
      message: "Demo fixture could not be loaded.",
      expose: true,
    })
  }

  const result = await persistDemoFixture(principal.userId, fixture)

  return NextResponse.json(
    { id: result.analysisId, status: "complete" },
    { status: 201, headers: { location: `/api/v1/analyses/${result.analysisId}` } },
  )
})
