import "server-only"

import { listAnnotationsForAnalysis } from "@/lib/annotations/repository"
import { loadPublicAnalysisState } from "@/lib/analysis/public-analysis"
import { listContestsForAnalysis } from "@/lib/contests/repository"
import { AppError } from "@/lib/errors/app-error"
import { applyCuration, projectOwnerCuration } from "@/lib/exports/publication-projection"
import { PUBLICATION_DISCLAIMER } from "@/lib/legal/publication-copy"
import { requirePublicSharingPublication } from "@/lib/legal/publication-policy"
import { sharedAnalysisSchema, shareSchema } from "./contracts"
import {
  findShareByDigest,
  insertShare,
  listShares,
  revokeShare,
  type ShareRow,
} from "./repository"
import { digestShareToken, generateShareToken, isActiveShare } from "./security"

function unavailable(): AppError {
  return new AppError({
    code: "NOT_FOUND",
    status: 404,
    message: "Shared analysis not found.",
    expose: true,
  })
}

export function toShareResource(row: ShareRow) {
  return shareSchema.parse({
    id: row.id,
    analysis_id: row.analysisId,
    status: row.status,
    expires_at: row.expiresAt?.toISOString() ?? null,
    revoked_at: row.revokedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  })
}
export async function createShare(input: {
  analysisId: string
  ownerId: string
  expiresAt: Date | null
}) {
  const policy = requirePublicSharingPublication()
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw new AppError({
      code: "INVALID_EXPIRY",
      status: 400,
      message: "Share expiry must be in the future.",
      expose: true,
    })
  }
  const state = await loadPublicAnalysisState(input.analysisId, { requireS9: true })
  if (!state.assembled) {
    throw new AppError({
      code: "ANALYSIS_NOT_READY",
      status: 409,
      message: "The post-S9 analysis is not ready for sharing.",
      expose: true,
    })
  }
  const token = generateShareToken()
  const row = await insertShare({
    ...input,
    tokenHash: digestShareToken(token),
    policyVersion: policy.policyVersion,
    disclaimerVersion: policy.disclaimerVersion,
    limitationsUrl: policy.limitationsUrl,
  })
  return { share: toShareResource(row), token }
}

export async function getShares(analysisId: string, ownerId: string) {
  requirePublicSharingPublication()
  return (await listShares(analysisId, ownerId)).map(toShareResource)
}

export async function removeShare(shareId: string, analysisId: string, ownerId: string) {
  requirePublicSharingPublication()
  return toShareResource(await revokeShare(shareId, analysisId, ownerId))
}
export async function getSharedAnalysis(token: string, now = new Date()) {
  requirePublicSharingPublication()
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unavailable()
  const result = await findShareByDigest(digestShareToken(token))
  if (!result || !isActiveShare(result.share, now)) throw unavailable()
  const state = await loadPublicAnalysisState(result.analysis.id, { requireS9: true })
  if (!state.assembled) throw unavailable()
  const [annotations, contests] = await Promise.all([
    listAnnotationsForAnalysis(result.analysis.id),
    listContestsForAnalysis(result.analysis.id),
  ])
  const curation = projectOwnerCuration(result.share.ownerId, annotations, contests)
  const curated = applyCuration(state.assembled, curation.annotations)
  const visibleFindingIds = new Set(curated.findings.map((finding) => finding.id))
  return sharedAnalysisSchema.parse({
    analysis_id: result.analysis.id,
    title: result.analysis.title,
    created_at: result.share.createdAt.toISOString(),
    expires_at: result.share.expiresAt?.toISOString() ?? null,
    curation_applied: curation.annotations.length > 0,
    disclosure: {
      policy_version: result.share.policyVersion,
      disclaimer_version: result.share.disclaimerVersion,
      disclaimer: PUBLICATION_DISCLAIMER,
      limitations_url: result.share.limitationsUrl,
    },
    analysis: {
      overview: curated.overview,
      findings: curated.findings,
      sources: curated.sources,
      structure_edges: curated.structure_edges,
    },
    annotations: curation.annotations.filter(
      (annotation) =>
        annotation.visibility === "shown" &&
        (annotation.finding_id === null || visibleFindingIds.has(annotation.finding_id)),
    ),
    contests: curation.contests.filter((contest) => visibleFindingIds.has(contest.finding_id)),
  })
}
