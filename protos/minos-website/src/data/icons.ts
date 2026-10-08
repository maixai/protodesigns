// 描边图标几何与名称收窄:viewBox 24,fill none + stroke currentColor。
// 渲染组件在 ../components/dl-icon.vue;契约里 icon 是开放字符串,
// 经 toIconName 收窄到本地图标集合,凑不齐时回退 grid。
export interface IconShape {
  paths: readonly string[]
  circles: readonly { cx: number; cy: number; r: number }[]
}

export const ICONS = {
  // 公网 IP:地球
  globe: {
    paths: ['M3 12h18', 'M12 3a13.5 13.5 0 0 1 0 18', 'M12 3a13.5 13.5 0 0 0 0 18'],
    circles: [{ cx: 12, cy: 12, r: 9 }],
  },
  // 端口转发:箭头进端口
  forward: {
    paths: ['M3 12h11', 'M9.5 6.5L15 12l-5.5 5.5', 'M18.5 5v14'],
    circles: [],
  },
  // 手工路由表:清单
  list: {
    paths: ['M8.5 6.5H20', 'M8.5 12H20', 'M8.5 17.5H20'],
    circles: [
      { cx: 4.5, cy: 6.5, r: 0.9 },
      { cx: 4.5, cy: 12, r: 0.9 },
      { cx: 4.5, cy: 17.5, r: 0.9 },
    ],
  },
  // 静态密钥 / 授权密钥:钥匙
  key: {
    paths: ['M13.5 10.5L20 4', 'M16 7l2 2'],
    circles: [{ cx: 9, cy: 15, r: 5 }],
  },
  // Linux:终端
  terminal: {
    paths: ['M4 5h16v14H4z', 'M7.5 9.5l3 3-3 3', 'M12.5 15.5h4'],
    circles: [],
  },
  // macOS:笔记本
  laptop: {
    paths: ['M6 5h12v10H6z', 'M3.5 19h17'],
    circles: [],
  },
  // Windows:窗口四格
  window: {
    paths: ['M4 5h16v14H4z', 'M4 9h16', 'M12 9v10'],
    circles: [],
  },
  // iOS:手机
  phone: {
    paths: ['M8 3h8v18H8z', 'M11 18.5h2'],
    circles: [],
  },
  // Android:机器人
  robot: {
    paths: ['M6 10h12v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-8z', 'M8.5 6.5L7 3.5', 'M15.5 6.5L17 3.5'],
    circles: [
      { cx: 9.5, cy: 13, r: 0.8 },
      { cx: 14.5, cy: 13, r: 0.8 },
    ],
  },
  // 容器:箱
  box: {
    paths: ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M12 12l8-4.5', 'M12 12L4 7.5', 'M12 12v9'],
    circles: [],
  },
  // 路由器:机身 + 天线与指示灯
  router: {
    paths: ['M4 13h16v7H4z', 'M9 13V5', 'M6.5 7.5a4 4 0 0 1 5 0'],
    circles: [
      { cx: 14.5, cy: 16.5, r: 0.8 },
      { cx: 17, cy: 16.5, r: 0.8 },
    ],
  },
  // IoT 设备:芯片
  chip: {
    paths: [
      'M7 7h10v10H7z',
      'M10.5 10.5h3v3h-3z',
      'M9.5 3v4',
      'M14.5 3v4',
      'M9.5 17v4',
      'M14.5 17v4',
      'M3 9.5h4',
      'M3 14.5h4',
      'M17 9.5h4',
      'M17 14.5h4',
    ],
    circles: [],
  },
  // 安装:下载
  download: {
    paths: ['M12 4v10', 'M8 10l4 4 4-4', 'M5 20h14'],
    circles: [],
  },
  // 确认:勾 + 圈
  'check-circle': {
    paths: ['M8.5 12.5l2.5 2.5 5-5.5'],
    circles: [{ cx: 12, cy: 12, r: 9 }],
  },
  // 配对结果勾
  check: {
    paths: ['M5 12.5l4.5 4.5L19 7.5'],
    circles: [],
  },
  // 回退:四宫格
  grid: {
    paths: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
    circles: [],
  },
} as const satisfies Record<string, IconShape>

export type IconName = keyof typeof ICONS

// 契约里 icon 是开放字符串;这里用 switch 收窄到本地图标集合,凑不齐时回退 grid。
export function toIconName(icon: string): IconName {
  switch (icon) {
    case 'globe':
    case 'forward':
    case 'list':
    case 'key':
    case 'terminal':
    case 'laptop':
    case 'window':
    case 'phone':
    case 'robot':
    case 'box':
    case 'router':
    case 'chip':
    case 'download':
    case 'check-circle':
    case 'check':
      return icon
    default:
      return 'grid'
  }
}
