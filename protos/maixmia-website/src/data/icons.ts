// 描边图标几何与名称收窄:viewBox 24,fill none + stroke currentColor。
// 渲染组件在 ../components/dl-icon.vue;契约里 icon 是开放字符串,
// 经 toIconName 收窄到本地图标集合,凑不齐时回退 grid。
export interface IconShape {
  paths: readonly string[]
  circles: readonly { cx: number; cy: number; r: number }[]
}

export const ICONS = {
  // 桌面 App:显示器
  monitor: {
    paths: ['M3 5h18v11H3z', 'M12 16v4', 'M8.5 20h7'],
    circles: [],
  },
  // headless:服务器(两格机架)
  server: {
    paths: ['M4 4h16v7H4z', 'M4 13h16v7H4z'],
    circles: [
      { cx: 7.2, cy: 7.5, r: 1 },
      { cx: 7.2, cy: 16.5, r: 1 },
    ],
  },
  // 移动 App:手机
  phone: {
    paths: ['M8 3h8v18H8z', 'M11 18.5h2'],
    circles: [],
  },
  // 浏览器窗口
  window: {
    paths: ['M4 5h16v14H4z', 'M4 9h16'],
    circles: [],
  },
  // 通知:铃铛
  bell: {
    paths: ['M18 16H6c1.3-1.5 2-2.8 2-6a4 4 0 0 1 8 0c0 3.2.7 4.5 2 6z', 'M10.4 19a1.8 1.8 0 0 0 3.2 0'],
    circles: [],
  },
  // 多端续接:循环同步箭头
  sync: {
    paths: ['M20 12a8 8 0 0 0-14-5.3', 'M4 12a8 8 0 0 0 14 5.3', 'M5.6 3.4l.3 3.6 3.6-.3', 'M18.4 20.6l-.3-3.6-3.6.3'],
    circles: [],
  },
  // 分享:三节点连线
  share: {
    paths: ['M8.1 10.9l7.3-4.2', 'M8.1 13.1l7.3 4.2'],
    circles: [
      { cx: 6, cy: 12, r: 2.3 },
      { cx: 17.6, cy: 5.6, r: 2.3 },
      { cx: 17.6, cy: 18.4, r: 2.3 },
    ],
  },
  // 统一管理:滑杆
  sliders: {
    paths: ['M4 7h8', 'M16.5 7H20', 'M4 17h4', 'M12.5 17H20'],
    circles: [
      { cx: 14.2, cy: 7, r: 2.1 },
      { cx: 10.2, cy: 17, r: 2.1 },
    ],
  },
  // 模型:芯片
  chip: {
    paths: ['M9 9h6v6H9z', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3'],
    circles: [],
  },
  // 插件:插头
  plug: {
    paths: ['M9 3v5', 'M15 3v5', 'M6 8h12v4a6 6 0 0 1-12 0V8z', 'M12 18v3'],
    circles: [],
  },
  // Skill:星芒
  sparkles: {
    paths: [
      'M11 4l1.5 4.1 4.1 1.5-4.1 1.5L11 15.2l-1.5-4.1-4.1-1.5 4.1-1.5L11 4z',
      'M18 14.5l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1z',
    ],
    circles: [],
  },
  // 安装:下载
  download: {
    paths: ['M12 4v10', 'M8 10l4 4 4-4', 'M5 20h14'],
    circles: [],
  },
  // 注册:身份牌
  badge: {
    paths: ['M4 6h16v12H4z', 'M8 11h5', 'M8 14h8'],
    circles: [],
  },
  // 回退:四宫格
  grid: {
    paths: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    circles: [],
  },
  // 复制:两张叠放的纸(组件内直接按名引用,不走契约)
  copy: {
    paths: [
      'M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z',
      'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    ],
    circles: [],
  },
  // 完成:对勾(复制成功态,纯字形变化,不上色)
  check: {
    paths: ['M4.5 12.5l5 5L19.5 7'],
    circles: [],
  },
} as const satisfies Record<string, IconShape>

export type IconName = keyof typeof ICONS

// 契约里 icon 是开放字符串;这里用 switch 收窄到本地图标集合,凑不齐时回退 grid。
export function toIconName(icon: string): IconName {
  switch (icon) {
    case 'monitor':
    case 'server':
    case 'phone':
    case 'window':
    case 'bell':
    case 'sync':
    case 'share':
    case 'sliders':
    case 'chip':
    case 'plug':
    case 'sparkles':
    case 'download':
    case 'badge':
      return icon
    default:
      return 'grid'
  }
}
