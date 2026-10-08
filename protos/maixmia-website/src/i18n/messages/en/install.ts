// 安装引导区块词条(en):结构必须与 zh-CN 完全一致(缺词条即编译报错)。
// 平台名、架构名、命令、路径等技术信息不随语言变化。
// 注意:若干文案的长度有讲究(见 zh-CN 对应注释)—— 三面板高度齐平依赖
// 文案在 1280 / 1600 两种宽度下的行数稳定,改动后必须重跑校准的高度断言。
export const install = {
  eyebrow: 'Install',
  title: 'Install Mia on your devices',
  lede: 'Desktop app, Headless on a server, or the upcoming mobile app — pick a way to start.',
  // Pill shown on the tab matching the detected platform; highlight only, nothing hidden.
  currentSystem: 'Your system',
  targets: {
    desktopApp: 'Desktop app',
    headless: 'Headless',
    mobileApp: 'Mobile',
  },
  // One-line hints under the tab labels (shown ≥1024px): the tab row doubles as
  // an enumeration of the three targets, so they stay legible without switching.
  tabHints: {
    desktopApp: 'On this computer',
    headless: 'On your server',
    mobileApp: 'Coming soon',
  },
  desktop: {
    // One-line positioning under the target name in the left column.
    summary: 'Runs locally on your computer — the everyday home for Mia.',
    platformsLabel: 'Desktop platform',
    archLabel: 'Architecture or package',
    platforms: {
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
    },
    download: (platform: string, arch: string) => `Download for ${platform} (${arch})`,
    downloadHint: 'Prototype demo — no real download is triggered',
    // Right-column fact grid labels.
    facts: {
      version: 'Version',
      requires: 'Requires',
      package: 'Arch / package',
      location: 'Install location',
      checksum: 'Checksum',
      updates: 'Updates',
    },
    // Placeholder / inferred values (not authoritative until confirmed):
    // filled in per common desktop distribution practice.
    factValues: {
      location: 'System default app location',
      checksum: 'SHA-256, published with each package',
      updates: 'Automatic checks with in-app prompts',
    },
  },
  headless: {
    // One-line positioning in the left column.
    summary: 'Runs on your server — reachable from any browser.',
    // Left-column notes (added content; not authoritative until confirmed): same
    // pattern as the mobile panel. Length matters: both languages must stay on a
    // single line within the 35em (525px) left column — the three panels' equal
    // height depends on stable line counts (pinned by calibrate assertions).
    continuity: {
      title: 'Same Mia',
      body: 'One Mia — it runs on your server and never sleeps.',
    },
    afterInstall: {
      title: 'After install',
      body: 'Open the printed address — any browser reaches it.',
    },
    copy: 'Copy install command',
    copied: 'Copied',
    copyFailed: 'Copy failed — select the command manually',
    commandCaption: 'Headless install command',
    facts: {
      prereq: {
        title: 'Prerequisites',
        // Length matters: at ≥1440 the fact grid goes three-column and this wraps
        // to three lines — panel height is driven by the left column (35em action
        // path), so the wrap no longer affects cross-panel equality; at 1280
        // (two-column) it must still stay on two lines so the right column does
        // not overtake the left.
        body: 'Requires curl (preinstalled on most systems). No admin rights needed.',
      },
      location: { title: 'Install location' },
      verify: { title: 'Verify the install' },
      uninstall: { title: 'Uninstall' },
    },
  },
  mobile: {
    // One-line positioning (leads into the waitlist action below).
    summary: 'The iOS and Android apps are in development — join the waitlist before launch.',
    comingSoon: 'Coming soon',
    platforms: {
      ios: 'iOS',
      android: 'Android',
    },
    stores: {
      ios: 'App Store',
      android: 'Google Play',
    },
    joinWaitlist: 'Join the waitlist',
    waitlistHint: 'Prototype demo — the waitlist is not open yet',
    facts: {
      platform: 'Platforms',
      store: 'Stores',
      status: 'Status',
      requirements: 'Requirements',
    },
    // Left-column notes (added content; not authoritative until confirmed):
    // continuity describes the relationship with the desktop app (inferred from the
    // "anywhere + notify" core values); waitlistNote states what joining the waitlist
    // means. Both must stay a single line — the left column is pinned at 35em.
    continuity: {
      title: 'Works with desktop',
      body: "One account. Mia's requests reach your phone — reply and the task continues.",
    },
    waitlistNote: {
      title: 'The waitlist',
      body: 'Leave your email — one message on launch day, nothing else.',
    },
    // Placeholder values (not authoritative until confirmed): minimum OS versions
    // are undecided; filled with current mainstream baselines.
    requirementsValue: { ios: 'iOS 17+', android: 'Android 12+' },
  },
}
