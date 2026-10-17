import type { AppRoute } from '../contracts/generated/app-route'
import type { ConsoleOverview } from '../contracts/generated/console-overview'
import { CONSOLE_OVERVIEW } from '../mocks/console'
import { delay } from '../mocks/delay'
import type { Result } from './result'

// 错误演示始终遵守 URL,重试可观察 loading → error。
export async function getConsoleData(demoState: AppRoute['demoState']): Promise<Result<ConsoleOverview>> {
  await delay()
  if (demoState === 'error') return { ok: false, error: new Error('Address plane temporarily unavailable') }
  if (demoState === 'empty') return { ok: true, value: {
    stats: { deviceCount: 0, networkCount: 0, membershipCount: 0, onlineCount: 0 },
    addressSpace: { networkPrefixCount: 0, ipv4MappingCount: 0, allocatedAddresses: 0, unresolvedConflicts: 0 },
    networks: [], devices: [], routes: [], dnsZones: [], conflicts: [],
  } }
  return { ok: true, value: structuredClone(CONSOLE_OVERVIEW) }
}
