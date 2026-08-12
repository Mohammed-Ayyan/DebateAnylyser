import "server-only"

import { serverEnv } from "@/lib/env/server"

type LogLevel = "debug" | "info" | "warn" | "error"
type LogContext = Record<string, unknown>

const levels: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const redactedKeys = /authorization|cookie|credential|password|secret|token/i

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen))
  if (!value || typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      redactedKeys.test(key) ? "[REDACTED]" : sanitize(item, seen),
    ]),
  )
}

function write(level: LogLevel, event: string, context: LogContext = {}) {
  if (levels[level] < levels[serverEnv.LOG_LEVEL]) return
  const sanitized = sanitize(context) as LogContext
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...sanitized })
  if (level === "error") console.error(entry)
  else if (level === "warn") console.warn(entry)
  else console.log(entry)
}

export const logger = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context),
}
