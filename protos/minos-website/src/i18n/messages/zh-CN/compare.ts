// 「旧方式 → Minos」对比带词条(zh-CN):左侧传统网络的繁琐,右侧 Minos 的对应结果。
// items 按契约 LegacyPainId 索引,pain 与 fix 在这里配对。
export const compare = {
  eyebrow: '新旧对照',
  tag: '对照 · 4 条',
  title: '从旧方式到 Minos,只隔着一次安装',
  legacyTitle: '传统网络',
  minosTitle: 'Minos',
  items: {
    publicIp: {
      pain: '为每台机器申请公网 IP',
      fix: '设备入网即得固定私有地址',
    },
    portForward: {
      pain: '在路由器上配置端口转发',
      fix: '无需开放任何入站端口',
    },
    manualRoutes: {
      pain: '手工维护路由表与防火墙规则',
      fix: '路由自动收敛,随入网即更新',
    },
    staticKeys: {
      pain: '静态密钥散落在每台机器上',
      fix: '密钥自动轮换,身份集中管理',
    },
  },
}
