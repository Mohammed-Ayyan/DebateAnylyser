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
    whisper: "ok" | "error" | "skipped"
    ollama: "ok" | "error" | "skipped"
  }
  providers: ProviderStatus[]
}

async function checkWhisperHealth(): Promise<"ok" | "error"> {
  const whisperUrl = serverEnv.WHISPER_URL || "http://localhost:5001/transcribe"
  try {
    const healthUrl = new URL("/health", whisperUrl).toString()
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(serverEnv.HEALTHCHECK_TIMEOUT_MS),
    })
    return res.ok ? "ok" : "error"
  } catch {
    return "error"
  }
}

async function checkOllamaHealth(): Promise<"ok" | "error"> {
  const ollamaUrl = serverEnv.OLLAMA_BASE_URL || "http://localhost:11434"
  try {
    const versionUrl = new URL("/api/version", ollamaUrl).toString()
    const res = await fetch(versionUrl, {
      signal: AbortSignal.timeout(serverEnv.HEALTHCHECK_TIMEOUT_MS),
    })
    return res.ok ? "ok" : "error"
  } catch {
    return "error"
  }
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
  const isWhisperActive = process.env.ASR_PROVIDER === "whisper"
  const isOllamaActive = [
    process.env.CLAIM_PROVIDER,
    process.env.SUPPORT_PROVIDER,
    process.env.STRUCTURE_PROVIDER,
    process.env.FALLACY_PROVIDER,
    process.env.EVIDENCE_VERIFIER_PROVIDER,
  ].some((p) => p === "ollama")

  const [database, redis, whisper, ollama] = await Promise.all([
    configuration === "ok"
      ? boundedCheck(() => getDatabase().execute(sql`select 1`))
      : Promise.resolve<"error">("error"),
    configuration === "ok"
      ? boundedCheck(() => getRedis().ping())
      : Promise.resolve<"error">("error"),
    isWhisperActive ? checkWhisperHealth() : Promise.resolve<"skipped">("skipped"),
    isOllamaActive ? checkOllamaHealth() : Promise.resolve<"skipped">("skipped"),
  ])
  return {
    ready: configuration === "ok" && database === "ok" && redis === "ok",
    checks: { configuration, database, redis, whisper, ollama },
    providers: describeFeatureProviders(process.env),
  }
}
