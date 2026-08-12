import type { Instrumentation } from "next"

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const [{ serverEnv }, { assertRuntimeRole }, { logger }] = await Promise.all([
    import("@/lib/env/server"),
    import("@/lib/env/runtime-validation"),
    import("@/lib/observability/logger"),
  ])
  assertRuntimeRole("web", process.env)
  logger.info("application.started", { environment: serverEnv.NODE_ENV, role: "web" })
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { logger } = await import("@/lib/observability/logger")
  logger.error("request.unhandled_error", {
    error,
    method: request.method,
    path: request.path,
    routeType: context.routeType,
    routePath: context.routePath,
    renderSource: context.renderSource,
  })
}
