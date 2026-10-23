import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { getDemoFixture, isDemoTranscript } from "@/lib/demo/fixtures"

/**
 * GET /api/v1/demo/public?slug=debate-demo-1
 *
 * Returns precomputed fixture data for public demo viewing.
 * Does NOT require authentication.
 * Does NOT access the database.
 * Only serves the two known demo slugs.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")

  if (!slug || !isDemoTranscript(slug)) {
    return NextResponse.json(
      { error: "Unknown demo slug. Valid options: debate-demo-1, debate-demo-2" },
      { status: 400 },
    )
  }

  const fixture = getDemoFixture(slug)
  if (!fixture) {
    return NextResponse.json(
      { error: "Demo fixture unavailable." },
      { status: 500 },
    )
  }

  return NextResponse.json(fixture, {
    status: 200,
    headers: {
      "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
