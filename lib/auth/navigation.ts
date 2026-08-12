export const DEFAULT_AUTH_RETURN_TO = "/dashboard"

const blockedReturnPrefixes = ["/api/v1/auth", "/auth/signin"]

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_RETURN_TO
  }
  try {
    const parsed = new URL(value, "http://local.invalid")
    const normalized = `${parsed.pathname}${parsed.search}`
    if (blockedReturnPrefixes.some((prefix) => parsed.pathname.startsWith(prefix))) {
      return DEFAULT_AUTH_RETURN_TO
    }
    return normalized
  } catch {
    return DEFAULT_AUTH_RETURN_TO
  }
}

export function applicationUrl(origin: string, path: string): URL {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`)
}
