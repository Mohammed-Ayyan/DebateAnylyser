export type HistoryOrderKey = { createdAt: Date; id: string }

export function compareHistoryOrder(left: HistoryOrderKey, right: HistoryOrderKey): number {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
}

export function isBehindHistoryCursor(item: HistoryOrderKey, cursor: HistoryOrderKey): boolean {
  return (
    item.createdAt.getTime() < cursor.createdAt.getTime() ||
    (item.createdAt.getTime() === cursor.createdAt.getTime() && item.id < cursor.id)
  )
}
