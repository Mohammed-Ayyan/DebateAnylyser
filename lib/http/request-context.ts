import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

const safeRequestId = /^[a-zA-Z0-9_-]{8,128}$/

export function getCorrelationId(request: NextRequest): string {
  const supplied = request.headers.get("x-request-id")
  return supplied && safeRequestId.test(supplied) ? supplied : randomUUID()
}
