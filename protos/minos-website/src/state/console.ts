import { computed, reactive, ref } from 'vue'
import { getConsoleData } from '../api/console'
import type { AppRoute } from '../contracts/generated/app-route'
import type { CreateNetworkInput } from '../contracts/generated/create-network-input'
import { ACCOUNT_PROFILE } from '../mocks/console'
import type { ConsoleOverview, DeviceSummary, Membership, NetworkSummary } from '../contracts/generated/console-overview'
import type { OverviewState } from '../contracts/generated/overview-state'
import { DEMO_JOINED_AT } from '../mocks/console'

const data = ref<ConsoleOverview | null>(null)
const status = ref<OverviewState['status']>('loading')
const requestSequence = ref(0)
const hostSequence = ref(80)
const networkSequence = ref(1)

function prefixAt(sequence: number): string { return `fd65:6d69:${sequence.toString(16).padStart(4, '0')}::/48` }
function nextNetworkSlot(sequence: number = networkSequence.value): number {
  return data.value?.networks.some((network) => network.ipv6Prefix === prefixAt(sequence) || network.id === `network-${sequence}`) ? nextNetworkSlot(sequence + 1) : sequence
}
const previewNetworkPrefix = computed(() => prefixAt(nextNetworkSlot()))

function createNetwork(input: CreateNetworkInput): NetworkSummary | null {
  const overview = data.value
  const name = input.name.trim()
  const dnsSuffix = input.dnsSuffix.trim().toLowerCase()
  if (!overview || !name || !dnsSuffix || overview.networks.some((network) => network.name === name || network.dnsSuffix === dnsSuffix)) return null
  const sequence = nextNetworkSlot()
  const ipv6Prefix = prefixAt(sequence)
  const reverseZone = `${ipv6Prefix.replace('::/48', '').replaceAll(':', '').split('').reverse().join('.')}.ip6.arpa`
  const network: NetworkSummary = {
    id: `network-${sequence}`, name, scope: 'workspace', owner: ACCOUNT_PROFILE.organization,
    identity: (overview.networks.length % 8) + 1, ipv6Prefix, dnsSuffix, reverseZone,
    ipv4Mappings: [], memberCount: 0, status: 'active',
  }
  overview.networks.push(network)
  overview.dnsZones.push({ networkId: network.id, suffix: dnsSuffix, reverseZone, resolver: ipv6Prefix.replace('::/48', '::53') })
  overview.routes.push({ id: `${network.id}-ula`, networkId: network.id, destination: ipv6Prefix, sourceCidr: null, family: 'ipv6', gateway: `${network.id}-gw`, priority: 100, state: 'active' })
  networkSequence.value = sequence + 1
  recount()
  status.value = 'ready'
  return network
}

async function load(demoState: AppRoute['demoState']): Promise<void> {
  const requestId = ++requestSequence.value
  status.value = 'loading'
  const result = await getConsoleData(demoState)
  if (requestId !== requestSequence.value) return
  if (!result.ok) { data.value = null; status.value = 'error'; return }
  data.value = result.value
  networkSequence.value = 1
  hostSequence.value = 80
  recount()
  status.value = result.value.devices.length === 0 && result.value.networks.length === 0 ? 'empty' : 'ready'
}

function recount(): void {
  if (!data.value) return
  const devices = data.value.devices
  data.value.stats = {
    deviceCount: devices.length, networkCount: data.value.networks.length,
    membershipCount: devices.reduce((total, device) => total + device.memberships.length, 0),
    onlineCount: devices.filter((device) => device.clientState === 'connected').length,
  }
  for (const network of data.value.networks) network.memberCount = devices.filter((device) => device.memberships.some((item) => item.networkId === network.id)).length
  data.value.addressSpace.networkPrefixCount = data.value.networks.length
  data.value.addressSpace.ipv4MappingCount = data.value.networks.reduce((total, network) => total + network.ipv4Mappings.length, 0)
  data.value.addressSpace.allocatedAddresses = data.value.stats.membershipCount
  data.value.addressSpace.unresolvedConflicts = data.value.conflicts.filter((conflict) => conflict.state === 'pending').length
}

function toggleClient(deviceId: string): void {
  const device = data.value?.devices.find((item) => item.id === deviceId)
  if (!device) return
  device.clientState = device.clientState === 'connected' ? 'disconnected' : 'connected'
  recount()
}

function toggleMembership(deviceId: string, networkId: string): void {
  const membership = data.value?.devices.find((item) => item.id === deviceId)?.memberships.find((item) => item.networkId === networkId)
  if (!membership || (membership.state !== 'active' && membership.state !== 'paused')) return
  membership.state = membership.state === 'active' ? 'paused' : 'active'
}

function authorizeMembership(deviceId: string, networkId: string): void {
  const network = data.value?.networks.find((item) => item.id === networkId)
  const membership = data.value?.devices.find((item) => item.id === deviceId)?.memberships.find((item) => item.networkId === networkId)
  if (network?.scope === 'workspace' && membership?.state === 'pending') membership.state = 'active'
}

export function hostSuffixFor(device: DeviceSummary): string {
  return device.memberships[0]?.hostSuffix ?? `::${hostSequence.value}`
}

export function addressFor(network: NetworkSummary, suffix: string): string {
  return `${network.ipv6Prefix.replace('::/48', '')}${suffix}`
}

function joinNetwork(deviceId: string, networkId: string, role: Membership['role']): boolean {
  const device = data.value?.devices.find((item) => item.id === deviceId)
  const network = data.value?.networks.find((item) => item.id === networkId)
  // 外部网络的组织管理权限只读,不能从组织控制台创建接入。
  if (!device || !network || network.scope === 'external' || device.memberships.some((item) => item.networkId === networkId)) return false
  const hostSuffix = hostSuffixFor(device)
  if (device.memberships.length === 0) hostSequence.value += 1
  device.memberships.push({ networkId, ipv6Address: addressFor(network, hostSuffix), hostSuffix, ipv4Compat: device.os === 'ios' || device.os === 'android' ? 'mapped' : 'clat', role, state: 'active', latencyMs: null, joinedAt: DEMO_JOINED_AT })
  recount()
  return true
}

export function effectiveState(device: DeviceSummary, membership: Membership): Membership['state'] | 'offline' {
  return device.clientState === 'disconnected' ? 'offline' : membership.state
}

export const consoleStore = reactive({ status, data, previewNetworkPrefix, load, createNetwork, toggleClient, toggleMembership, authorizeMembership, joinNetwork })
