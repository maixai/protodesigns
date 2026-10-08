import type { AppRoute } from '../contracts/generated/app-route'
import type { ConsoleOverview } from '../contracts/generated/console-overview'
import { CONSOLE_OVERVIEW } from '../mocks/console'
import { delay } from '../mocks/delay'
import type { Result } from './result'

// URL #/console?s=empty / ?s=error 控制演示结果,不使用不可复现的随机失败。
// 重试仍遵守当前 URL:错误演示可反复重试,移除标记即恢复正常数据。
export async function getConsoleOverview(demoState: AppRoute['demoState']): Promise<Result<ConsoleOverview>> {
  await delay()
  if (demoState === 'error') return { ok: false, error: new Error('Overview temporarily unavailable') }
  if (demoState === 'empty') {
    return { ok: true, value: { stats: { networkCount: 0, machineCount: 0, onlineCount: 0 }, networks: [], machines: [] } }
  }
  return { ok: true, value: structuredClone(CONSOLE_OVERVIEW) }
}
