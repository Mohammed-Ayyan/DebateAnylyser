export function analysisCleanupDedupeKey(analysisId: string): string {
  return `analysis-cleanup:${analysisId}`
}

export function accountCleanupDedupeKey(ownerId: string): string {
  return `account-cleanup:${ownerId}`
}

export function buildAccountDeletionPlan(ownerId: string, analysisIds: readonly string[]) {
  return {
    revokeAnalysisIds: [...analysisIds],
    cancelAnalysisIds: [...analysisIds],
    cleanupJobs: analysisIds.map((analysisId) => ({
      analysisId,
      dedupeKey: analysisCleanupDedupeKey(analysisId),
    })),
    accountCleanupDedupeKey: accountCleanupDedupeKey(ownerId),
  }
}
