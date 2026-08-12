import { createHash, randomBytes } from "node:crypto"

const sharedPathPattern = /\/(?:api\/v1\/)?shared\/[^/?#]+/g

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url")
}

export function digestShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function isActiveShare(
  share: { status: "active" | "revoked"; revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
): boolean {
  return (
    share.status === "active" &&
    share.revokedAt === null &&
    (share.expiresAt === null || share.expiresAt.getTime() > now.getTime())
  )
}

export function redactSharedBearerPath(path: string): string {
  return path.replace(
    sharedPathPattern,
    (match) => `${match.slice(0, match.lastIndexOf("/") + 1)}[REDACTED]`,
  )
}
