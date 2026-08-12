import "server-only"

import { S3ObjectStorage } from "@/lib/storage/s3-storage"
import type { ObjectStorage } from "@/lib/storage/types"
import type { DeletionAccepted } from "./contracts"
import {
  getAccountCleanupState,
  getAnalysisCleanupArtifacts,
  hardDeleteAccount,
  hardDeleteAnalysis,
  requestAccountDeletion,
  requestAnalysisDeletion,
} from "./repository"

const accepted: DeletionAccepted = { status: "accepted" }

export async function deleteAnalysisForOwner(
  ownerId: string,
  analysisId: string,
): Promise<DeletionAccepted> {
  await requestAnalysisDeletion(ownerId, analysisId, "manual")
  return accepted
}

export async function deleteAccount(ownerId: string): Promise<DeletionAccepted> {
  await requestAccountDeletion(ownerId)
  return accepted
}

export async function cleanupAnalysis(
  analysisId: string,
  storage: ObjectStorage = new S3ObjectStorage(),
): Promise<void> {
  const keys = await getAnalysisCleanupArtifacts(analysisId)
  for (const key of keys) await storage.deleteObject(key)
  await hardDeleteAnalysis(analysisId)
}

export async function cleanupAccount(
  ownerId: string,
  storage: ObjectStorage = new S3ObjectStorage(),
): Promise<boolean> {
  const state = await getAccountCleanupState(ownerId)
  if (!state) return true
  if (state.remainingAnalyses > 0) return false
  for (const key of state.objectKeys) await storage.deleteObject(key)
  return hardDeleteAccount(ownerId)
}
