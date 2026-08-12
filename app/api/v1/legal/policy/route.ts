import { NextResponse, type NextRequest } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { withApiRoute } from "@/lib/http/route"
import { getServerLegalPolicy, isLegalPolicyActive } from "@/lib/legal/server-policy"

export const GET = withApiRoute(async (request: NextRequest) => {
  requireAuthenticated(await resolvePrincipal(request))
  const policy = getServerLegalPolicy()
  const active = isLegalPolicyActive(policy)
  const mode = policy.counselApproved
    ? "counsel_approved"
    : policy.developmentTestMode
      ? "development_test"
      : "inactive"

  return NextResponse.json({
    active,
    mode,
    version: policy.version,
    sources: {
      upload: active && policy.allowUploads,
      paste: active && policy.allowPaste,
      url: active && policy.allowedUrlHosts.length > 0,
    },
  })
})
