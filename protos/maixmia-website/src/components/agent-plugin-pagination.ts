// 按列表实际可视高度计算每页条数;无效测量至少保留一条,避免分页进入空状态。
export function pageSizeForHeight(availableHeight: number, rowHeight: number): number {
  if (!Number.isFinite(availableHeight) || !Number.isFinite(rowHeight) || availableHeight <= 0 || rowHeight <= 0) return 1
  return Math.max(1, Math.floor(availableHeight / rowHeight))
}
