import type { NextRequest } from "next/server"

import { requireAuthenticated, resolvePrincipal } from "@/lib/auth/principal"
import { authorizeAnalysisOwner } from "@/lib/authz/analysis-policy"
import { createRedisSubscriber } from "@/lib/cache/redis"
import type { AnalysisEvent } from "@/lib/contracts/events"
import { AppError } from "@/lib/errors/app-error"
import { analysisEventChannel, replayAnalysisEvents } from "@/lib/events/repository"
import {
  encodeSseEvent,
  parseEventCursor,
  shouldEmitPublicAnalysisEvent,
  SSE_HEARTBEAT,
} from "@/lib/events/sse"
import { withApiRoute } from "@/lib/http/route"
import { logger } from "@/lib/observability/logger"
import { acquireStreamLimit, getRequestRateLimitSubject } from "@/lib/rate-limit/limiter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }
const encoder = new TextEncoder()

function reconcileEvent(): string {
  const event: AnalysisEvent = {
    type: "error",
    code: "RECONCILE_REQUIRED",
    message: "The replay cursor has expired. Refresh the analysis state.",
    reconcile_required: true,
  }
  return `event: error\ndata: ${JSON.stringify(event)}\n\n`
}

export const GET = withApiRoute<RouteContext>(async (request: NextRequest, context) => {
  const { id: analysisId } = await context.params
  const principal = requireAuthenticated(await resolvePrincipal(request))
  await authorizeAnalysisOwner(principal, analysisId)

  let cursor: bigint
  try {
    cursor = parseEventCursor(request.headers.get("last-event-id"))
  } catch (error) {
    throw new AppError({
      code: "INVALID_EVENT_CURSOR",
      status: 400,
      message: "Last-Event-ID must be a non-negative decimal integer.",
      expose: true,
      cause: error,
    })
  }

  const lease = await acquireStreamLimit(getRequestRateLimitSubject(request, principal))
  const subscriber = createRedisSubscriber()
  const channel = analysisEventChannel(analysisId)
  try {
    await subscriber.connect()
    await subscriber.subscribe(channel)
  } catch (error) {
    subscriber.disconnect()
    await lease.release()
    throw error
  }

  let replay
  try {
    replay = await replayAnalysisEvents(analysisId, cursor)
  } catch (error) {
    subscriber.disconnect()
    await lease.release()
    throw error
  }
  if (replay.kind === "reconcile-required") {
    subscriber.disconnect()
    await lease.release()
    return new Response(reconcileEvent(), {
      headers: { "content-type": "text/event-stream; charset=utf-8" },
    })
  }

  let cleanupStream = () => {
    subscriber.disconnect()
    void lease.release()
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let lastSequence = cursor
      let closed = false
      let flushing = false
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let poll: ReturnType<typeof setInterval> | undefined

      const cleanup = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        if (poll) clearInterval(poll)
        request.signal.removeEventListener("abort", cleanup)
        subscriber.disconnect()
        void lease.release().catch((error) => {
          logger.warn("analysis_stream.lease_release_failed", { analysisId, error })
        })
      }
      cleanupStream = cleanup

      const close = () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // The client may already have disconnected.
        }
      }

      const emit = (sequence: bigint, event: AnalysisEvent) => {
        if (closed || sequence <= lastSequence) return
        lastSequence = sequence
        // S2-S9 batches are durable internal progress records. Public findings are emitted
        // only by S10 after the centralized S9 traceability gate has completed.
        if (!shouldEmitPublicAnalysisEvent(event)) return
        controller.enqueue(encoder.encode(encodeSseEvent(sequence, event)))
        if (event.type === "analysis.done") close()
      }

      const flush = async () => {
        if (closed || flushing) return
        flushing = true
        try {
          const result = await replayAnalysisEvents(analysisId, lastSequence)
          if (result.kind === "reconcile-required") {
            controller.enqueue(encoder.encode(reconcileEvent()))
            close()
            return
          }
          for (const item of result.events) emit(item.sequence, item.event)
        } catch (error) {
          logger.error("analysis_stream.replay_failed", { analysisId, error })
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                type: "error",
                code: "STREAM_ERROR",
                message: "The stream was interrupted. Reconnect to continue.",
              })}\n\n`,
            ),
          )
          close()
        } finally {
          flushing = false
        }
      }

      subscriber.on("message", (receivedChannel) => {
        if (receivedChannel === channel) void flush()
      })
      subscriber.on("error", (error) => {
        logger.warn("analysis_stream.redis_subscriber_error", { analysisId, error })
      })
      request.signal.addEventListener("abort", cleanup, { once: true })

      for (const item of replay.events) emit(item.sequence, item.event)
      if (closed) return
      poll = setInterval(() => void flush(), 2_000)
      heartbeat = setInterval(() => {
        if (closed) return
        controller.enqueue(encoder.encode(SSE_HEARTBEAT))
        void lease.renew().then((renewed) => {
          if (!renewed) close()
        })
      }, 15_000)
    },
    cancel() {
      cleanupStream()
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  })
})
