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
  // 等待交互:交互式卡片(圆角矩形 + 两条选项内容)。会话 tab 的状态图标之一,
  // 表达「Agent 递上一张要你拍板的卡片」。与 sparkles(星芒)/ check(对勾)在灰度下也互不相似。
  choiceCard: {
    paths: [
      'M8 5h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z',
      'M9 10h6.5',
      'M9 14h4',
    ],
    circles: [],
  },
  // 工作区文件类型(document):带折角与文字行的页面
  fileText: {
    paths: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
    circles: [],
  },
  // (sheet):带表头行与分列的表格
  table: {
    paths: ['M4 5h16v14H4z', 'M4 10h16', 'M10 5v14'],
    circles: [],
  },
  // (slide):演示画面 + 支架
  presentation: {
    paths: ['M4 4h16v11H4z', 'M12 15v4', 'M9 19h6'],
    circles: [],
  },
  // (image):相框 + 山形与日点
  image: {
    paths: ['M4 5h16v14H4z', 'M4 16l4.5-4.5L14 17l3-3 3 3'],
    circles: [{ cx: 8.8, cy: 9.2, r: 1.4 }],
  },
  // (data):数据库圆柱
  database: {
    paths: ['M12 3c4.4 0 8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5 7.6 3 12 3z', 'M4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13', 'M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5'],
    circles: [],
  },
  // (code):尖括号
  code: {
    paths: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
    circles: [],
  },
  // 搜索:放大镜(对话栏搜索框)
  search: {
    paths: ['M21 21l-4.3-4.3'],
    circles: [{ cx: 11, cy: 11, r: 7 }],
  },
  // 对话栏折叠:左向尖角
  chevronLeft: {
    paths: ['M15 6l-6 6 6 6'],
    circles: [],
  },
  // 对话栏展开:右向尖角
  chevronRight: {
    paths: ['M9 6l6 6-6 6'],
    circles: [],
  },
  // 回到底部:向下的箭头(竖杆 + 箭头头),不复用旋转的 chevron / 下载图标 ——
  // 「回到底部」是跳转语义,与「展开」「下载」都不是一回事。
  arrowDown: {
    paths: ['M12 5v14', 'M6 13l6 6 6-6'],
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
    case 'fileText':
    case 'table':
    case 'presentation':
    case 'image':
    case 'database':
    case 'code':
    case 'search':
    case 'chevronLeft':
    case 'chevronRight':
      return icon
    default:
      return 'grid'
  }
}
