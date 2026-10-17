import type { ConsoleNavItem } from '../contracts/generated/console-nav-item'
import type { NetworkSummary } from '../contracts/generated/console-overview'
import { useI18n } from '../i18n'

export const CONSOLE_NAV: readonly ConsoleNavItem[] = [
  { id: 'overview', icon: 'grid' },
  { id: 'devices', icon: 'laptop' },
  { id: 'networks', icon: 'globe' },
  { id: 'routing', icon: 'forward' },
  { id: 'access', icon: 'key' },
  { id: 'settings', icon: 'router' },
]

export function identityClass(identity: number): string {
  return `dl-identity-${((identity - 1) % 8 + 8) % 8 + 1}`
}

export function useConsoleLabels() {
  const { t, locale } = useI18n()
  function networkName(network: NetworkSummary): string {
    // 网络名是用户数据,直接使用数据中的名称,不按固定 id 做本地化映射。
    return network.name
  }
  function lastSeen(value: string): string {
    return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'zh-CN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC', timeZoneName: 'short',
    }).format(new Date(value))
  }
  function networkLabel(count: number): string {
    const unit = count === 1 ? t.value.console.overview.networkSingular : t.value.console.overview.networkUnit
    return `${count} ${unit}`
  }
  function tunnelLabel(count: number): string {
    return `${t.value.console.overview.singleTunnel} · ${networkLabel(count)}`
  }
  function membershipCoverage(joined: number, total: number): string {
    return `${t.value.console.overview.joined} ${joined} / ${networkLabel(total)}`
  }
  return { networkName, lastSeen, networkLabel, tunnelLabel, membershipCoverage }
}
