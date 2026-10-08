// 安装引导区块词条(zh-CN):三个目标 —— 桌面 App / Headless / 移动端,
// 标签切换(Tabs)形态:表头三个 Tab 左对齐,面板满宽两列呈现。
// 平台名、架构名、命令、路径等是技术信息,不随语言变化
// (命令常量在 data/home.ts,平台 / 架构展示名也在数据层)。
export const install = {
  eyebrow: '安装',
  title: '把 Mia 装到你的设备上',
  lede: '桌面 App、服务器上的 Headless,或即将上线的移动 App —— 选一种方式开始。',
  // 检测当前平台后,在对应 Tab 上加的小标;只高亮,不隐藏其它目标、不改选中态。
  currentSystem: '你的系统',
  targets: {
    desktopApp: '桌面 App',
    headless: 'Headless',
    mobileApp: '移动端',
  },
  // Tab 标签下的极简说明(≥1024px 显示):让三个目标不切 Tab 也可辨认
  // (标签行同时承担「枚举 + 选择」,缓解 Tab 藏起其余目标的短时记忆负担)。
  tabHints: {
    desktopApp: '本机运行',
    headless: '服务器后台',
    mobileApp: '即将上线',
  },
  desktop: {
    // 面板左列一句话定位(目标名下方)。
    summary: '在你的电脑上本地运行,是日常使用 Mia 的主入口。',
    platformsLabel: '桌面平台',
    archLabel: '架构或包形态',
    platforms: {
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    download: (platform: string, arch: string) => `下载 ${platform} 版(${arch})`,
    downloadHint: '原型演示,暂不触发真实下载',
    // 右列事实格标签。
    facts: {
      version: '版本',
      requires: '系统要求',
      package: '架构 / 包形态',
      location: '安装位置',
      checksum: '校验和',
      updates: '更新方式',
    },
    // 占位 / 推定值(产品方确认前不得当真):按常规桌面分发实践填写。
    factValues: {
      location: '系统默认应用目录',
      checksum: 'SHA-256,随安装包发布',
      updates: '自动检查并提示更新',
    },
  },
  headless: {
    // 面板左列一句话定位。
    summary: '装在你的服务器上,从任何浏览器访问。',
    // 左列说明段(补内容,产品方确认前不得当真):与移动端面板的说明段同写法。
    // 长度有讲究:双语都必须在左列 35em(525px)内保持单行 —— 三面板高度齐平
    // 依赖行数稳定,改动后必须重跑校准的高度断言。
    continuity: {
      title: '与桌面 App 的关系',
      body: '同一个 Mia,只是跑在服务器上,不随电脑休眠。',
    },
    afterInstall: {
      title: '装好之后',
      body: '按终端提示打开访问地址,任何浏览器都能进入。',
    },
    copy: '复制安装命令',
    copied: '已复制',
    copyFailed: '复制失败,请手动选择复制',
    commandCaption: 'Headless 安装命令',
    facts: {
      prereq: {
        title: '前置条件',
        // 文案长度有讲究:≥1440 事实格升三列后此处会折成三行 —— 面板高度
        // 由左列(35em 行动路径)驱动,行数变化不再影响三面板齐平;但 1280
        // (两列)下仍须保持两行,避免右列反超左列。
        body: '安装需要 curl(绝大多数系统自带);全程无需管理员权限,一条命令完成。',
      },
      location: { title: '安装位置' },
      verify: { title: '验证安装' },
      uninstall: { title: '卸载' },
    },
  },
  mobile: {
    // 面板左列一句话定位(衔接下方的等待列表行动点)。
    summary: 'iOS 与 Android 版正在开发中,上架前可先加入等待列表。',
    comingSoon: '即将上线',
    platforms: {
      ios: 'iOS',
      android: 'Android',
    },
    stores: {
      ios: 'App Store',
      android: 'Google Play',
    },
    joinWaitlist: '加入等待列表',
    waitlistHint: '原型演示,等待列表暂未开放',
    facts: {
      platform: '平台',
      store: '商店',
      status: '状态',
      requirements: '系统要求',
    },
    // 左列说明段(补内容,产品方确认前不得当真):
    // continuity 是与桌面端的关系(推定:依据「随时随地 + 通知」两块核心价值拟定);
    // waitlistNote 是等待列表的后果说明(自拟)。两者长度都有讲究:左列钉 35em,
    // 单行才能与桌面 / Headless 面板高度齐平。
    continuity: {
      title: '与桌面端的关系',
      body: '同一账号;Mia 要拍板时通知到手机,回复后继续。',
    },
    waitlistNote: {
      title: '等待列表',
      body: '留下邮箱,上架当天收到一封通知邮件,没有别的。',
    },
    // 占位值(产品方确认前不得当真):最低系统版本未定,按当前主流基线填写。
    requirementsValue: { ios: 'iOS 17+', android: 'Android 12+' },
  },
}
