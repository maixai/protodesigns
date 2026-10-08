import type { AccountProfile } from '../contracts/generated/account-profile'
import type { ConsoleOverview } from '../contracts/generated/console-overview'

export const ACCOUNT_PROFILE: AccountProfile = {
  name: 'Alex Chen',
  email: 'alex.chen@northstar.example',
  organization: 'Northstar Studio',
}

export const CONSOLE_OVERVIEW: ConsoleOverview = {
  stats: { networkCount: 3, machineCount: 5, onlineCount: 4 },
  networks: [
    { name: 'production-east', cidr: '100.64.8.0/24', machineCount: 2, status: 'active' },
    { name: 'team-staging', cidr: '100.64.16.0/24', machineCount: 2, status: 'active' },
    { name: 'studio-lab', cidr: '100.64.24.0/24', machineCount: 1, status: 'active' },
  ],
  machines: [
    { hostname: 'edge-gateway-01', ip: '100.64.8.10', os: 'linux', lastSeen: '2026-10-08T08:42:00Z', latencyMs: 12, status: 'online' },
    { hostname: 'build-agent-03', ip: '100.64.8.21', os: 'linux', lastSeen: '2026-10-08T08:42:00Z', latencyMs: 8, status: 'online' },
    { hostname: 'alex-macbook', ip: '100.64.16.12', os: 'macos', lastSeen: '2026-10-08T08:42:00Z', latencyMs: 24, status: 'online' },
    { hostname: 'design-win-02', ip: '100.64.16.18', os: 'windows', lastSeen: '2026-10-08T07:18:00Z', latencyMs: null, status: 'offline' },
    { hostname: 'lab-sensor-a', ip: '100.64.24.5', os: 'linux', lastSeen: '2026-10-08T08:42:00Z', latencyMs: 31, status: 'online' },
  ],
}
