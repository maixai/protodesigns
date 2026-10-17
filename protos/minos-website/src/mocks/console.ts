import type { AccountProfile } from '../contracts/generated/account-profile'
import type { ConsoleOverview, DeviceSummary, Membership, NetworkSummary, RouteEntry } from '../contracts/generated/console-overview'

export const ACCOUNT_PROFILE: AccountProfile = {
  name: 'Alex Chen', email: 'alex.chen@northstar.example', organization: 'Northstar Studio',
}

export const DEMO_LAST_SEEN = '2026-10-17T08:42:00Z'
export const DEMO_JOINED_AT = '2026-08-12T09:10:00Z'

const NETWORKS: NetworkSummary[] = [
  { id: 'home', name: 'Home', scope: 'external', owner: 'Alex Chen', identity: 1, ipv6Prefix: 'fd7a:3c91:2e40::/48', dnsSuffix: 'home.lan', reverseZone: '0.4.e.2.1.9.c.3.a.7.d.f.ip6.arpa', ipv4Mappings: [{ ipv4Cidr: '192.168.1.0/24', ipv6Prefix: '64:ff9b:1:1::/96' }], memberCount: 3, status: 'active' },
  { id: 'northstar', name: 'Northstar', scope: 'workspace', owner: 'Northstar Studio', identity: 2, ipv6Prefix: 'fd21:9b04:7c60::/48', dnsSuffix: 'corp.northstar.example', reverseZone: '0.6.c.7.4.0.b.9.1.2.d.f.ip6.arpa', ipv4Mappings: [{ ipv4Cidr: '192.168.1.0/24', ipv6Prefix: '64:ff9b:1:2::/96' }, { ipv4Cidr: '10.20.0.0/16', ipv6Prefix: '64:ff9b:1:3::/96' }], memberCount: 4, status: 'active' },
  { id: 'lab', name: 'Lab', scope: 'workspace', owner: 'Northstar Studio', identity: 3, ipv6Prefix: 'fd3e:55a1:c200::/48', dnsSuffix: 'lab.minos', reverseZone: '0.0.2.c.1.a.5.5.e.3.d.f.ip6.arpa', ipv4Mappings: [{ ipv4Cidr: '10.30.0.0/16', ipv6Prefix: '64:ff9b:1:4::/96' }], memberCount: 3, status: 'active' },
]

function membership(networkId: string, hostSuffix: string, state: Membership['state'], ipv4Compat: Membership['ipv4Compat'], latencyMs: number | null, role: Membership['role'] = 'member'): Membership {
  const prefix = NETWORKS.find((network) => network.id === networkId)?.ipv6Prefix.replace('::/48', '') ?? ''
  return { networkId, ipv6Address: `${prefix}${hostSuffix}`, hostSuffix, state, ipv4Compat, latencyMs, role, joinedAt: DEMO_JOINED_AT }
}

function device(id: string, os: DeviceSummary['os'], memberships: Membership[], clientVersionState: DeviceSummary['clientVersionState'] = 'current'): DeviceSummary {
  return { id, name: id, os, memberships, clientVersionState, clientVersion: clientVersionState === 'outdated' ? '1.7.9' : '1.8.2', clientState: 'connected', lastSeen: DEMO_LAST_SEEN }
}

const DEVICES: DeviceSummary[] = [
  device('alex-macbook', 'macos', [membership('home', '::12', 'active', 'clat', 8), membership('northstar', '::12', 'active', 'clat', 24), membership('lab', '::12', 'active', 'clat', 31)]),
  device('alex-iphone', 'ios', [membership('home', '::13', 'active', 'mapped', 42), membership('northstar', '::13', 'active', 'mapped', 38), membership('lab', '::13', 'pending', 'mapped', null)]),
  device('office-imac', 'macos', [membership('northstar', '::20', 'active', 'clat', 6)], 'outdated'),
  device('home-nas', 'linux', [membership('home', '::30', 'active', 'none', 3)]),
  device('lab-gateway', 'linux', [membership('lab', '::40', 'active', 'clat', 4, 'subnetRouter'), membership('northstar', '::40', 'paused', 'clat', 18, 'subnetRouter')]),
]

const ROUTES: RouteEntry[] = NETWORKS.flatMap((network): RouteEntry[] => {
  const gateway = network.id === 'lab' ? 'lab-gateway' : `${network.id}-gw`
  return [
    { id: `${network.id}-ula`, destination: network.ipv6Prefix, sourceCidr: null, family: 'ipv6', networkId: network.id, gateway, priority: 100, state: 'active' },
    ...network.ipv4Mappings.map((mapping): RouteEntry => ({ id: `${network.id}-${mapping.ipv6Prefix}`, destination: mapping.ipv6Prefix, sourceCidr: mapping.ipv4Cidr, family: 'ipv4', networkId: network.id, gateway, priority: 100, state: 'active' })),
  ]
})

export const CONSOLE_OVERVIEW: ConsoleOverview = {
  stats: { deviceCount: 5, networkCount: 3, membershipCount: 10, onlineCount: 5 },
  addressSpace: { networkPrefixCount: 3, ipv4MappingCount: 4, allocatedAddresses: 10, unresolvedConflicts: 0 },
  networks: NETWORKS,
  devices: DEVICES,
  routes: [...ROUTES, { id: 'local-default', destination: '::/0', sourceCidr: null, family: 'ipv6', networkId: null, gateway: 'local', priority: 1000, state: 'active' }],
  dnsZones: NETWORKS.map((network) => ({ networkId: network.id, suffix: network.dnsSuffix, reverseZone: network.reverseZone, resolver: network.ipv6Prefix.replace('::/48', '::53') })),
  conflicts: [{ id: 'home-corp-overlap', kind: 'ipv4Overlap', state: 'resolved', networkIds: ['home', 'northstar'], ipv4Cidrs: ['192.168.1.0/24', '192.168.1.0/24'], mappings: ['64:ff9b:1:1::/96', '64:ff9b:1:2::/96'] }],
}
