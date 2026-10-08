const MIN_DELAY_MS = 150
const MAX_DELAY_MS = 300

// 模拟一次网络往返;默认随机 150–300ms,仅延迟随机、结果不随机。
export function delay(ms: number = MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}
