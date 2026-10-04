// 展示层格式化:把 token 数与毫秒数转成状态行里的紧凑文案。
// 数值变化时列宽不跳动,依赖角色层的 font-variant-numeric: tabular-nums。

// token 数:1000 以上折成 "1.2k",否则原样输出。
export function formatTokens(value: number): string {
  if (value < 1000) {
    return String(value)
  }
  return `${(value / 1000).toFixed(1)}k`
}

// 毫秒:小于 1 秒显示整数毫秒,否则显示一位小数的秒。
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

// 粗略估算 token 数:约 4 个字符 1 个 token,用于让状态行数字随对话增长。
export function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4))
}
