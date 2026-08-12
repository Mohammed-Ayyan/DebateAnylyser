import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { AppError, toPublicError } from "@/lib/errors/app-error"
import { logger } from "@/lib/observability/logger"
import { redactSharedBearerPath } from "@/lib/shares/security"
import { getCorrelationId } from "./request-context"

export type ApiHandler<TContext = unknown> = (
  request: NextRequest,
  context: TContext,
  correlationId: string,
) => Promise<Response>

export function withApiRoute<TContext>(handler: ApiHandler<TContext>) {
  return async (request: NextRequest, context: TContext): Promise<Response> => {
    const correlationId = getCorrelationId(request)
    try {
      const response = await handler(request, context, correlationId)
      response.headers.set("x-correlation-id", correlationId)
      response.headers.set("cache-control", "no-store")
      return response
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500
      logger.error("api.request_failed", {
        correlationId,
        method: request.method,
        path: redactSharedBearerPath(request.nextUrl.pathname),
        status,
        error,
      })
      const headers: Record<string, string> = {
        "x-correlation-id": correlationId,
        "cache-control": "no-store",
      }
      const retryAfter = error instanceof AppError ? error.details?.retryAfterSeconds : undefined
      if (typeof retryAfter === "number") headers["retry-after"] = String(Math.ceil(retryAfter))
      return NextResponse.json(toPublicError(error, correlationId), { status, headers })
    }
  }
}
