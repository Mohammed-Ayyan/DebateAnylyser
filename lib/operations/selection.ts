export type OperationType =
  | "analysis_cleanup"
  | "account_cleanup"
  | "report_export"
  | "account_data_export"

const priority: Record<OperationType, number> = {
  analysis_cleanup: 0,
  account_cleanup: 1,
  report_export: 2,
  account_data_export: 2,
}

export function compareOperationCandidates(
  left: { type: OperationType; availableAt: Date; createdAt: Date; id: string },
  right: { type: OperationType; availableAt: Date; createdAt: Date; id: string },
): number {
  return (
    priority[left.type] - priority[right.type] ||
    left.availableAt.getTime() - right.availableAt.getTime() ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.id.localeCompare(right.id)
  )
}
