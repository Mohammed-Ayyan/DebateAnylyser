import "server-only"

import { sql } from "drizzle-orm"

import { getRedis } from "@/lib/cache/redis"
import { getDatabase } from "@/lib/db/client"
import {
  describeFeatureProviders,
  validateRuntimeRole,
  type ProviderStatus,
} from "@/lib/env/runtime-validation"
import { serverEnv } from "@/lib/env/server"

export type ReadinessResult = {
  ready: boolean
  checks: {
    configuration: "ok" | "error"
    database: "ok" | "error"
    redis: "ok" | "error"
  }
  providers: ProviderStatus[]
}

async function boundedCheck(action: () => Promise<unknown>): Promise<"ok" | "error"> {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      action(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("health check timed out")),
          serverEnv.HEALTHCHECK_TIMEOUT_MS,
        )
      }),
    ])
    return "ok"
  } catch {
    return "error"
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function checkReadiness(): Promise<ReadinessResult> {
  const validation = validateRuntimeRole("web", process.env)
  const configuration = validation.ok ? "ok" : "error"
  const [database, redis] = await Promise.all([
    configuration === "ok"
      ? boundedCheck(() => getDatabase().execute(sql`select 1`))
      : Promise.resolve<"error">("error"),
    configuration === "ok"
      ? boundedCheck(() => getRedis().ping())
      : Promise.resolve<"error">("error"),
  ])
  return {
    ready: configuration === "ok" && database === "ok" && redis === "ok",
    checks: { configuration, database, redis },
    providers: describeFeatureProviders(process.env),
  }
}
