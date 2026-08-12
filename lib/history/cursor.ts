import { z } from "zod"

export const historyCursorSchema = z
  .object({
    created_at: z.string().datetime(),
    id: z.string().uuid(),
  })
  .strict()

export type HistoryCursor = z.infer<typeof historyCursorSchema>

const INVALID_CURSOR_MESSAGE = "Invalid cursor."
const base64urlPattern = /^[A-Za-z0-9_-]+$/

function encodeBytes(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function encodeHistoryCursor(value: HistoryCursor): string {
  const payload = historyCursorSchema.parse(value)
  return encodeBytes(new TextEncoder().encode(JSON.stringify(payload)))
}

export function decodeHistoryCursor(cursor: string): HistoryCursor {
  try {
    if (!base64urlPattern.test(cursor) || cursor.length % 4 === 1) {
      throw new Error(INVALID_CURSOR_MESSAGE)
    }

    const base64 = cursor.replaceAll("-", "+").replaceAll("_", "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    if (encodeBytes(bytes) !== cursor) throw new Error(INVALID_CURSOR_MESSAGE)

    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    const payload = historyCursorSchema.safeParse(JSON.parse(json))
    if (!payload.success) throw new Error(INVALID_CURSOR_MESSAGE)
    return payload.data
  } catch {
    throw new Error(INVALID_CURSOR_MESSAGE)
  }
}
