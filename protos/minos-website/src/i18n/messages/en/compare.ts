// 「旧方式 → Minos」对比带词条(en):左侧传统网络的繁琐,右侧 Minos 的对应结果。
// items 按契约 LegacyPainId 索引,pain 与 fix 在这里配对。
export const compare = {
  eyebrow: 'OLD VS NEW',
  tag: 'COMPARE · 4 ROWS',
  title: 'From the old way to Minos, in one install',
  legacyTitle: 'Traditional networking',
  minosTitle: 'Minos',
  items: {
    publicIp: {
      pain: 'Request a public IP for every machine',
      fix: 'Every device gets a stable private address on join',
    },
    portForward: {
      pain: 'Configure port forwarding on routers',
      fix: 'No inbound ports to open, anywhere',
    },
    manualRoutes: {
      pain: 'Maintain route tables and firewall rules by hand',
      fix: 'Routes converge automatically as devices join',
    },
    staticKeys: {
      pain: 'Static keys scattered across machines',
      fix: 'Keys rotate automatically, identities managed in one place',
    },
  },
}
