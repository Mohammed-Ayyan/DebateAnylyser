import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { findActiveUserById } from "@/lib/auth/identity-repository"
import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { serverEnv } from "@/lib/env/server"
import { AppError } from "@/lib/errors/app-error"
import { assertTrustedOrigin } from "@/lib/http/origin"
import { withApiRoute } from "@/lib/http/route"
import { parseUploadRequest } from "@/lib/ingest/contracts"
import { prepareUpload } from "@/lib/ingest/service"
import { requireApprovedLegalPolicy } from "@/lib/legal/server-policy"
import { enforceRateLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const POST = withApiRoute(async (request: NextRequest) => {
  assertTrustedOrigin(request)
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await enforceRateLimit("B", getRequestRateLimitSubject(request, principal))
  const upload = parseUploadRequest(
    await request.json().catch(() => null),
    serverEnv.INGEST_MAX_UPLOAD_BYTES,
  )
  const user = await findActiveUserById(principal.userId)
  if (!user) {
    throw new AppError({
      code: "NOT_FOUND",
      status: 404,
      message: "Account not found.",
      expose: true,
    })
  }
  const target = await prepareUpload(
    principal.userId,
    user.acceptableUseVersion,
    requireApprovedLegalPolicy(),
    upload,
  )
  return NextResponse.json(
    {
      upload_url: target.uploadUrl,
      media_key: target.mediaKey,
      expires_at: target.expiresAt,
    },
    { status: 201 },
  )
})
