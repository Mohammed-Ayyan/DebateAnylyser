import "server-only"

import { and, desc, eq, isNull } from "drizzle-orm"

import { getDatabase } from "@/lib/db/client"
import { analyses, shares } from "@/lib/db/schema"
import { AppError } from "@/lib/errors/app-error"

export type ShareRow = typeof shares.$inferSelect

function notFound(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: "Share not found.",
    expose: true,
  })
}

export async function insertShare(input: {
  analysisId: string
  ownerId: string
  tokenHash: string
  policyVersion: string
  disclaimerVersion: string
  limitationsUrl: string
  expiresAt: Date | null
}): Promise<ShareRow> {
  const [row] = await getDatabase().insert(shares).values(input).returning()
  if (!row) throw new Error("SHARE_INSERT_FAILED")
  return row
}

export async function listShares(analysisId: string, ownerId: string): Promise<ShareRow[]> {
  return getDatabase()
    .select()
    .from(shares)
    .where(and(eq(shares.analysisId, analysisId), eq(shares.ownerId, ownerId)))
    .orderBy(desc(shares.createdAt), desc(shares.id))
}
export async function revokeShare(
  shareId: string,
  analysisId: string,
  ownerId: string,
  now = new Date(),
): Promise<ShareRow> {
  const [row] = await getDatabase()
    .update(shares)
    .set({ status: "revoked", revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(shares.id, shareId),
        eq(shares.analysisId, analysisId),
        eq(shares.ownerId, ownerId),
        eq(shares.status, "active"),
      ),
    )
    .returning()
  if (!row) throw notFound()
  return row
}

export async function findShareByDigest(tokenHash: string) {
  const [result] = await getDatabase()
    .select({ share: shares, analysis: analyses })
    .from(shares)
    .innerJoin(analyses, eq(analyses.id, shares.analysisId))
    .where(and(eq(shares.tokenHash, tokenHash), isNull(analyses.deletedAt)))
    .limit(1)
  return result
}
