// 模拟网络延迟的辅助工具,供 dummy API 层使用。
const MIN_DELAY_MS = 150
const MAX_DELAY_MS = 300

// 生成 [150, 300] 区间内的随机延迟毫秒数。
function randomLatency(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))
}

// 模拟一次网络往返;未传参时随机 150-300ms 延迟。
export function delay(ms: number = randomLatency()): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
