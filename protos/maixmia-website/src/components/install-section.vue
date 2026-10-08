<script setup lang="ts">
// 安装引导:独立区块,放在切换面板(FeatureTabs)之后、页脚之前。
// 三个安装目标(桌面 App / Headless / 移动端)用标签切换(Tabs)呈现 —— 选中后
// 整块面板满容器宽展示:面板两列,左列钉在正文行宽(35em)承载行动路径,
// 右列吸收剩余宽度承载事实格(与 quickstart 同源的共享边线格)。
//
// 前两版的教训(本版的设计约束由此而来):
//   - v1 三 Tab + 面板内容左对齐堆叠:内容仅 98px 高却占满 1232px 宽,右侧全空;
//   - v2 三卡并列:单卡内容列 286px ≈ 19 字/行(35em 行宽基线的 54%),
//     中文句句折行,且区块头 525 / 卡组 1050 / 命令区 787.5 三条宽度轴互不对齐。
//   本版把「切换省下的纵向空间」全部换成「单面板的横向宽裕」:面板满宽、
//   左列守 35em、右列 500–800px;三面板内容骨架统一(Headless 左列以两段
//   说明段补齐行动路径,与桌面 / 移动端同量级),高度差按宽度分档设红线:
//   ≥1024(两列布局能吸收内容量差异)用绝对值 —— 高度差 <5% 且最矮面板
//   与容器之间 ≤96px;<1024 面板退化为单列堆叠,内容量差异在纵向上完整
//   展开、不再能被两列吸收,压到 96px 以内只能塞占位内容(反模式),
//   故改比例红线 —— 空白带 ≤ 容器高的 1/8(约一个内容块,小于一个内容块
//   的空档不会被读作「缺了一块」)。两档都由校准断言固化。
//
// 布局纪律(已确认,勿偏离):
//   - 区块头左对齐:共享类 .dl-section-head 原样使用,不局部居中;
//   - 仪器外框 1px --dl-border-strong + 大圆角,不加阴影(描边与阴影不叠加);
//     表头三个 Tab 左对齐,下缘一条 1px --dl-border-base 贯通横线;
//   - 面板容器 = 三面板叠在同一 grid 单元格,容器高 = 最高面板,切换不跳动;
//   - 两列之间一条 1px --dl-border-base 竖线,上下留端点(home-split 分隔线同款);
//   - 面板内边距 48px、块间距 32px;只放大锚点元素(面板标题 23px、主按钮 44px、
//     命令 15px),正文基准 15px 不动;
//   - 青瓷口径:三个面板各有一个青瓷主按钮(.dl-btn--primary),但非活动面板
//     不可见(visibility + inert),任一时刻全页可见的青瓷行动点仍只有 1 个,
//     配额不超标;
//   - 活动 Tab 指示条用中性双通道(一级文字色 + 字重 500 + 2px --dl-border-strong
//     短线):首屏的青瓷短线已占配额,此处几何位置承担定位,颜色不承担语义;
//   - 安装 Tab 是组件内状态,绝不接管地址栏 hash —— feature-tabs 已有
//     hashchange 监听 + setHashSilently 整套机制,两处争抢会出现两个 hash 所有者。
//
// 三个目标在不切 Tab 时的可见性(NN/g 对「需要并列比较时不该用 Tab」的缓解,
// 已确认):Tab 标签带图标(monitor / server / phone,与 formFactors 同族)+
// 标签下一行 xs 极简说明(≥1024px 显示),标签行同时承担「枚举 + 选择」。
//
// Tab 语义与交互(W3C APG tabs pattern,与 feature-tabs 同款约定):
//   - role=tablist / tab / tabpanel + aria-selected + aria-controls +
//     aria-labelledby;roving tabindex(仅选中 tab 为 0);←/→ 循环、Home/End 跳首尾;
//     自动激活,切换后焦点留在 tab 上;面板 tabindex="0";
//   - 三面板叠放保留占位:非活动面板 visibility:hidden + inert(不可 Tab、
//     不被读屏播报、不参与对比度断言);切换动效只动 opacity + transform,
//     不过渡 height;
//   - 活动指示短线由 JS 实测写入 CSS 变量(等宽单元格之外的 flex 布局下
//     百分比定位不可靠),切换时只 transition transform;
//   - 窄屏 Tab 行横向溢出:复用 feature-tabs 的整套机制(溢出端渐隐遮罩 +
//     细滚动条 + 鼠标纵向滚轮映射横向 + 激活时对齐进可视区)。
//
// 平台检测(已确认):挂载后检测当前平台,命中则在对应 Tab 上加「你的系统」
// 小标 —— 只高亮,绝不隐藏其它目标、不改选中态与文案;初始渲染保持中性;
// 解析不出就不标,这是正常路径而非错误。
//
// 复制功能的三条硬约定(沿用上轮已验证的实现):
//   1. 命令块的复制按钮固定在代码块右侧、不参与横向滚动:代码区独立滚动,
//      文字在代码区内被裁剪,任何 scrollLeft 下都不会滚到按钮底下;命中区 44×44
//      (--dl-target-size),视觉字形不随之放大;默认三级色,hover 提到一级;
//      成功态只做字形变化(copy → check)+ 可及名变化,不上色;
//   2. aria-live 状态区常驻 DOM(role="status"),点击后写入结果、数秒后清空;
//      全页只有这一个播报区 —— headless 面板左列主按钮与命令块图标按钮共用
//      同一份 copyState(复制的是同一条命令,状态理应一致);
//   3. 失败路径必须存在:clipboard 在非安全上下文或权限被拒时会 reject,
//      失败后文案改「复制失败,请手动选择」并自动选中命令文本(用户可直接 Ctrl+C)。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from '../i18n'
import type { InstallTargetId } from '../contracts/generated/install-target'
import {
  HEADLESS_INSTALL_COMMAND,
  HEADLESS_READING,
  HEADLESS_UNINSTALL_COMMAND,
  HEADLESS_VERIFY_COMMAND,
  MIA_DESKTOP_VERSION,
  desktopBuilds,
  desktopPlatformOrder,
  installTargetReadings,
  installTargets,
  mobilePlatforms,
} from '../data/home'
import type { DesktopBuildOption } from '../data/home'
import { toIconName } from '../data/icons'
import type { IconName } from '../data/icons'
import DlIcon from './dl-icon.vue'
import SegmentedControl from './segmented-control.vue'
import type { SegmentedOption } from './segmented-control.vue'

const { t } = useI18n()
const message = useMessage()

// ---- Tab 行:三个安装目标(图标 + 名称 + 极简说明)----

interface InstallTab {
  id: InstallTargetId
  label: string
  hint: string
  icon: IconName
}

// 标签顺序即面板顺序;id 兼作 tab ↔ tabpanel 的 ARIA 关联键
// (tab 的 DOM id 为 install-tab-<id>,面板为 install-panel-<id>)。
const tabs = computed<InstallTab[]>(() =>
  installTargets.map((target) => ({
    id: target.id,
    label: t.value.install.targets[target.id],
    hint: t.value.install.tabHints[target.id],
    icon: toIconName(target.icon),
  })),
)

const activeIndex = ref(0)
const tablistRef = ref<HTMLElement | null>(null)

// 中性短线的位置与宽度:实测活动 tab 写入 CSS 变量,切换时只 transition transform
// (flex 布局 + 窄屏横向滚动下百分比定位不可靠,与 feature-tabs 同理统一走实测)。
function measureIndicator(): void {
  const el = tablistRef.value
  if (el === null) return
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex.value]
  if (tab === undefined) return
  el.style.setProperty('--indicator-x', `${tab.offsetLeft}px`)
  el.style.setProperty('--indicator-w', `${tab.offsetWidth}px`)
}

// 活动标签的横向对齐(点击 / 键盘 / resize 共用):需要滚动时把活动标签左缘
// 对齐到 gutter(= scroll-padding-inline,≤720 时与溢出端渐隐遮罩同宽)。
// 标签相邻无间隙,活动标签左缘进 gutter 时,左侧邻居露出的残段恰好等于
// gutter,完整落在渐隐区内 —— 不会留下半截实体文字的碎片(m2)。
// 直接写 scrollLeft,不用 scrollIntoView:其纵向分量在标签条不在视口内时
// 会拽动页面。
function scrollActiveTabIntoView(): void {
  const el = tablistRef.value
  if (el === null) return
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex.value]
  if (tab === undefined) return
  // gutter 与 CSS 的 scroll-padding-inline 同源:从计算样式取,不在 JS 里复制取值
  const gutter = Number.parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0
  const maxScrollLeft = el.scrollWidth - el.clientWidth
  const tabStart = tab.offsetLeft
  const tabEnd = tabStart + tab.offsetWidth
  // 已完整可见且两侧 clearance 都 ≥ gutter:不动,避免无谓跳动
  if (tabStart >= el.scrollLeft + gutter && tabEnd <= el.scrollLeft + el.clientWidth - gutter) {
    return
  }
  el.scrollLeft = Math.min(Math.max(tabStart - gutter, 0), maxScrollLeft)
}

function activate(index: number): void {
  activeIndex.value = index
  measureIndicator()
  // 窄屏下标签栏可横向滚动:激活态变化时把活动标签对齐进可视区(见上)。
  // tab 元素全部常驻 DOM,无需等渲染提交即可滚动。
  scrollActiveTabIntoView()
}

// 用户主动切换(tab 点击 / 键盘)的统一入口。只有组件内状态 ——
// 绝不写地址栏 hash(feature-tabs 是唯一的 hash 所有者)。
function selectTab(index: number): void {
  activate(index)
}

// 键盘操作后把焦点移到目标 tab(焦点不进入 panel)。
function focusTab(index: number): void {
  tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
}

function onTablistKeydown(event: KeyboardEvent): void {
  const count = tabs.value.length
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (activeIndex.value + 1) % count
  else if (event.key === 'ArrowLeft') next = (activeIndex.value - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  selectTab(next)
  focusTab(next)
}

// 窄屏标签条的横向滚动状态:溢出端渐隐遮罩由这两个布尔驱动(见 CSS)。
const canScrollStart = ref(false)
const canScrollEnd = ref(false)

function updateScrollState(): void {
  const el = tablistRef.value
  if (el === null) return
  canScrollStart.value = el.scrollLeft > 1
  canScrollEnd.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}

// 窗口尺寸 / 字号变化会改变标签条可用宽度:重测短线位置、补正活动标签的
// 横向对齐,并刷新溢出端遮罩。只观察标签条自身,回调内不写尺寸,不会触发观察循环。
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measureIndicator()
  updateScrollState()
  resizeObserver = new ResizeObserver(() => {
    measureIndicator()
    scrollActiveTabIntoView()
    updateScrollState()
  })
  if (tablistRef.value !== null) resizeObserver.observe(tablistRef.value)
})

// 鼠标滚轮在横向溢出的标签条上映射为横向滚动(Chrome 下纵向滚轮默认只滚页面);
// 触控板双指横滑(deltaX 为主)原生可用,不拦截;滚到边界即放行。
function onTablistWheel(event: WheelEvent): void {
  const el = tablistRef.value
  if (el === null) return
  if (el.scrollWidth <= el.clientWidth) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const maxScrollLeft = el.scrollWidth - el.clientWidth
  const next = Math.min(Math.max(el.scrollLeft + event.deltaY, 0), maxScrollLeft)
  if (next === el.scrollLeft) return
  event.preventDefault()
  el.scrollLeft = next
}

// 语言切换会改变各标签宽度但未必改变标签条整体尺寸(标签条是块级满宽,
// ResizeObserver 观察不到),故显式 watch 文案源,渲染提交后重测短线与溢出态。
watch(tabs, async () => {
  await nextTick()
  measureIndicator()
  scrollActiveTabIntoView()
  updateScrollState()
})

// ---- 平台检测:只产出「哪个 Tab 加小标」,无副作用 ----

// lib.dom 尚未收录 navigator.userAgentData;这里只声明用到的最小结构(低熵 platform 字段)。
interface NavigatorUAData {
  userAgentData?: { platform?: unknown }
}

// 检测当前平台:命中桌面平台 → desktopApp 的 Tab,命中移动平台 → mobileApp 的 Tab,
// 否则不标。取值链:userAgentData 低熵 platform(Chromium 系;不请求
// getHighEntropyValues —— 那是浏览器指纹面)→ 退回解析 userAgent →
// 都解析不出返回 null(正常路径)。
function detectTarget(): InstallTargetId | null {
  const ua = navigator.userAgent.toLowerCase()
  // iPadOS 桌面模式:UA 伪装成 Macintosh(userAgentData 低熵 platform 同样报
  // macOS,单看 platform 会被骗到桌面侧)。两个判据任一命中即判移动侧:
  // UA 里保留的 Mobile token,或 maxTouchPoints > 0 —— Apple 不出触屏 Mac,
  // 「Mac 皮囊 + 触点」只可能是 iPad。必须先于下面的桌面判据执行。
  if (ua.includes('macintosh') && (ua.includes('mobile') || navigator.maxTouchPoints > 0)) {
    return 'mobileApp'
  }
  const uaData = (navigator as NavigatorUAData).userAgentData
  const source =
    typeof uaData?.platform === 'string' && uaData.platform !== ''
      ? uaData.platform
      : navigator.userAgent
  const s = source.toLowerCase()
  // 移动 token 优先:Android UA 同时含「linux」,先判移动侧。
  if (
    s.includes('iphone') ||
    s.includes('ipad') ||
    s.includes('ipod') ||
    s.includes('android') ||
    s === 'ios'
  ) {
    return 'mobileApp'
  }
  if (s.includes('mac') || s.includes('win') || s.includes('linux')) return 'desktopApp'
  return null
}

// 初始渲染保持中性(null):检测在挂载后进行,避免小标闪现,也避免未来转 SSR 时
// hydration 不一致。
const detectedTarget = ref<InstallTargetId | null>(null)
onMounted(() => {
  detectedTarget.value = detectTarget()
})

// ---- 桌面面板:平台 × 架构 ----

const platformOptions = computed<readonly SegmentedOption[]>(() =>
  desktopPlatformOrder.map((platform) => ({
    id: platform,
    label: t.value.install.desktop.platforms[platform],
  })),
)
const activePlatform = ref(desktopPlatformOrder[0] ?? 'macos')

// 当前平台的架构 / 包形态选项;切换平台时回落到该平台第一项。
const archOptions = computed<readonly DesktopBuildOption[]>(() =>
  desktopBuilds.filter((build) => build.platform === activePlatform.value),
)
const activeArch = ref('')

// 当前构建:选中架构对应的条目;无效时(切换平台的瞬间)回落到该平台第一项。
const currentBuild = computed<DesktopBuildOption | undefined>(
  () => archOptions.value.find((build) => build.arch === activeArch.value) ?? archOptions.value[0],
)

// 平台变化时架构回落到该平台第一项(watch 保持 activeArch 永远有效)。
watch(archOptions, (options) => {
  if (options.some((build) => build.arch === activeArch.value)) return
  activeArch.value = options[0]?.arch ?? ''
})

// 初始化:默认平台的第一项架构。
activeArch.value = archOptions.value[0]?.arch ?? ''

const archSegmentOptions = computed<readonly SegmentedOption[]>(() =>
  archOptions.value.map((build) => ({ id: build.arch, label: build.label })),
)

// 下载按钮文案写明平台与架构:误判在点击前可见。
const downloadLabel = computed(() => {
  const build = currentBuild.value
  if (build === undefined) return ''
  return t.value.install.desktop.download(
    t.value.install.desktop.platforms[build.platform],
    build.label,
  )
})

function onDownload(): void {
  message.info(t.value.install.desktop.downloadHint)
}

// ---- Headless 面板:复制安装命令(左列主按钮 + 命令块图标按钮共用同一状态机)----

const commandRef = ref<HTMLElement | null>(null)

// 复制状态机:idle → copied / failed,数秒后回到 idle。
type CopyState = 'idle' | 'copied' | 'failed'
const copyState = ref<CopyState>('idle')
const COPY_FEEDBACK_MS = 4000
let copyTimer: number | undefined

const copyStatusText = computed(() => {
  if (copyState.value === 'copied') return t.value.install.headless.copied
  if (copyState.value === 'failed') return t.value.install.headless.copyFailed
  return ''
})

const copyButtonLabel = computed(() =>
  copyState.value === 'copied' ? t.value.install.headless.copied : t.value.install.headless.copy,
)

// 失败兜底:自动选中命令文本,让用户直接 Ctrl+C。
function selectCommandText(): void {
  const el = commandRef.value
  if (el === null) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

async function onCopy(): Promise<void> {
  window.clearTimeout(copyTimer)
  try {
    // navigator.clipboard 在非安全上下文(http://)下不存在,先判在不在再调
    if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(HEADLESS_INSTALL_COMMAND)
    copyState.value = 'copied'
  } catch (error: unknown) {
    copyState.value = 'failed'
    selectCommandText()
  }
  copyTimer = window.setTimeout(() => {
    copyState.value = 'idle'
  }, COPY_FEEDBACK_MS)
}

// ---- 移动端面板:等待列表 ----

// 左列底部读数:最低系统要求(占位值,见词条注释)的等宽摘要。
const mobileReading = computed(
  () =>
    `${t.value.install.mobile.requirementsValue.ios} · ${t.value.install.mobile.requirementsValue.android}`,
)

function onWaitlist(): void {
  message.info(t.value.install.mobile.waitlistHint)
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.clearTimeout(copyTimer)
})
</script>

<template>
  <section id="install" class="install dl-scope dl-scope--dark dl-section" aria-labelledby="install-title">
    <div class="dl-container">
      <!-- 区块头:左对齐,共享类原样(不局部居中 —— 少一条对齐轴) -->
      <div class="dl-section-head">
        <p class="dl-eyebrow">{{ t.install.eyebrow }}</p>
        <h2 id="install-title" class="dl-h2">{{ t.install.title }}</h2>
        <p class="dl-lede">{{ t.install.lede }}</p>
      </div>

      <!-- 仪器外框:1px strong 描边 + 大圆角,不加阴影;圆角只圆外围一圈 -->
      <div class="install__frame">
        <!-- 表头:三个 Tab 左对齐 + 下缘贯通横线(线同时是面板内容的起始线) -->
        <div class="install__head">
          <div
            ref="tablistRef"
            class="install__tablist"
            :class="{
              'install__tablist--overflow-start': canScrollStart,
              'install__tablist--overflow-end': canScrollEnd,
            }"
            role="tablist"
            :aria-label="t.install.title"
            @keydown="onTablistKeydown"
            @scroll.passive="updateScrollState"
            @wheel="onTablistWheel"
          >
            <!-- 活动指示短线:纯装饰(aria-hidden),位置 / 宽度由 JS 实测写入
                 --indicator-x / --indicator-w,切换时纯 transform 平移;
                 中性档(--dl-border-strong),几何位置承担定位,颜色不承担语义 -->
            <span class="install__indicator" aria-hidden="true" />
            <button
              v-for="(tab, index) in tabs"
              :id="`install-tab-${tab.id}`"
              :key="tab.id"
              class="install__tab"
              type="button"
              role="tab"
              :data-target="tab.id"
              :aria-selected="activeIndex === index"
              :aria-controls="`install-panel-${tab.id}`"
              :tabindex="activeIndex === index ? 0 : -1"
              @click="selectTab(index)"
            >
              <DlIcon :name="tab.icon" size="md" />
              <span class="install__tab-text">
                <span class="install__tab-label">{{ tab.label }}</span>
                <span class="install__tab-hint">{{ tab.hint }}</span>
              </span>
              <span v-if="detectedTarget === tab.id" class="install__current">
                {{ t.install.currentSystem }}
              </span>
            </button>
          </div>
        </div>

        <!-- 面板容器:三面板叠在同一 grid 单元格,容器高 = 最高面板,切换不跳动 -->
        <div class="install__panels">
          <!-- 桌面 App 面板 -->
          <div
            id="install-panel-desktopApp"
            class="install__panel"
            :class="{ 'install__panel--active': activeIndex === 0 }"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="install-tab-desktopApp"
            :inert="activeIndex !== 0"
          >
            <div class="install__panel-inner">
              <div class="install__main">
                <div class="install__main-head">
                  <p class="install__eyebrow dl-mono">{{ installTargetReadings.desktopApp }}</p>
                  <h3 class="install__target-name">{{ t.install.targets.desktopApp }}</h3>
                  <p class="install__target-summary">{{ t.install.desktop.summary }}</p>
                </div>
                <div class="install__fields">
                  <div class="install__field">
                    <span class="install__field-label" aria-hidden="true">
                      {{ t.install.desktop.platformsLabel }}
                    </span>
                    <SegmentedControl
                      v-model="activePlatform"
                      :label="t.install.desktop.platformsLabel"
                      :options="platformOptions"
                    />
                  </div>
                  <div class="install__field">
                    <span class="install__field-label" aria-hidden="true">
                      {{ t.install.desktop.archLabel }}
                    </span>
                    <SegmentedControl
                      v-model="activeArch"
                      :label="t.install.desktop.archLabel"
                      :options="archSegmentOptions"
                    />
                  </div>
                </div>
                <div class="install__main-foot">
                  <button
                    class="dl-btn dl-btn--primary dl-btn--lg install__action"
                    type="button"
                    @click="onDownload"
                  >
                    {{ downloadLabel }}
                  </button>
                  <p class="install__reading dl-mono">
                    {{ MIA_DESKTOP_VERSION }} · {{ currentBuild?.minOs ?? '' }}
                  </p>
                </div>
              </div>
              <span class="install__col-divider" aria-hidden="true" />
              <div class="install__aside">
                <dl class="install__facts">
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.version }}</dt>
                    <dd class="dl-mono">{{ MIA_DESKTOP_VERSION }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.requires }}</dt>
                    <dd class="dl-mono">{{ currentBuild?.minOs ?? '' }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.package }}</dt>
                    <dd>{{ currentBuild?.label ?? '' }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.location }}</dt>
                    <dd>{{ t.install.desktop.factValues.location }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.checksum }}</dt>
                    <dd>{{ t.install.desktop.factValues.checksum }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.desktop.facts.updates }}</dt>
                    <dd>{{ t.install.desktop.factValues.updates }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <!-- Headless 面板 -->
          <div
            id="install-panel-headless"
            class="install__panel"
            :class="{ 'install__panel--active': activeIndex === 1 }"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="install-tab-headless"
            :inert="activeIndex !== 1"
          >
            <div class="install__panel-inner">
              <div class="install__main">
                <div class="install__main-head">
                  <p class="install__eyebrow dl-mono">{{ installTargetReadings.headless }}</p>
                  <h3 class="install__target-name">{{ t.install.targets.headless }}</h3>
                  <p class="install__target-summary">{{ t.install.headless.summary }}</p>
                </div>
                <!-- 说明段:与桌面 App 的关系 / 装好之后的访问方式。与移动端面板同写法,
                     双语都须在左列 35em 内保持单行 —— 行数稳定是三面板高度齐平的前提
                     (校准断言固化);内容本身是补内容,见词条注释 -->
                <div class="install__note">
                  <h4 class="install__note-title">{{ t.install.headless.continuity.title }}</h4>
                  <p class="install__note-body">{{ t.install.headless.continuity.body }}</p>
                </div>
                <div class="install__note">
                  <h4 class="install__note-title">{{ t.install.headless.afterInstall.title }}</h4>
                  <p class="install__note-body">{{ t.install.headless.afterInstall.body }}</p>
                </div>
                <div class="install__main-foot">
                  <button
                    class="dl-btn dl-btn--primary dl-btn--lg install__action"
                    type="button"
                    @click="onCopy"
                  >
                    {{ copyButtonLabel }}
                  </button>
                  <p class="install__reading dl-mono">{{ HEADLESS_READING }}</p>
                </div>
              </div>
              <span class="install__col-divider" aria-hidden="true" />
              <div class="install__aside">
                <!-- 命令区:满右列宽(满宽后长命令不再需要横向滚动;375px 等窄屏
                     仍退回代码区内横向滚动,复制按钮在滚动容器之外的固定格) -->
                <div class="install__command-area">
                  <p class="install__command-caption dl-mono">
                    {{ t.install.headless.commandCaption }}
                  </p>
                  <div class="install__code-wrap">
                    <div class="install__code">
                      <span class="install__prompt dl-mono" aria-hidden="true">$</span>
                      <code ref="commandRef" class="dl-mono install__command">{{ HEADLESS_INSTALL_COMMAND }}</code>
                    </div>
                    <button
                      class="install__copy"
                      type="button"
                      :aria-label="copyButtonLabel"
                      @click="onCopy"
                    >
                      <DlIcon :name="copyState === 'copied' ? 'check' : 'copy'" size="sm" />
                    </button>
                  </div>
                  <!-- aria-live 状态区:常驻 DOM —— 动态插入的 live region 在多数读屏上
                       不触发播报;空文本时按行高预留一整行,点击复制不引发布局跳动 -->
                  <p class="install__copy-status dl-mono" role="status" aria-live="polite">
                    {{ copyStatusText }}
                  </p>
                </div>
                <dl class="install__facts">
                  <div class="install__fact">
                    <dt>{{ t.install.headless.facts.prereq.title }}</dt>
                    <dd class="install__fact-prose">{{ t.install.headless.facts.prereq.body }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.headless.facts.location.title }}</dt>
                    <dd class="dl-mono">~/.local/bin</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.headless.facts.verify.title }}</dt>
                    <dd>
                      <code class="dl-mono install__inline-code">{{ HEADLESS_VERIFY_COMMAND }}</code>
                    </dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.headless.facts.uninstall.title }}</dt>
                    <dd>
                      <code class="dl-mono install__inline-code">{{ HEADLESS_UNINSTALL_COMMAND }}</code>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <!-- 移动端面板 -->
          <div
            id="install-panel-mobileApp"
            class="install__panel"
            :class="{ 'install__panel--active': activeIndex === 2 }"
            role="tabpanel"
            tabindex="0"
            aria-labelledby="install-tab-mobileApp"
            :inert="activeIndex !== 2"
          >
            <div class="install__panel-inner">
              <div class="install__main">
                <div class="install__main-head">
                  <p class="install__eyebrow dl-mono">{{ installTargetReadings.mobileApp }}</p>
                  <h3 class="install__target-name">{{ t.install.targets.mobileApp }}</h3>
                  <p class="install__target-summary">{{ t.install.mobile.summary }}</p>
                </div>
                <!-- 说明段:与桌面端的关系(推定)+ 等待列表的后果说明(自拟),
                     见词条注释;放在左列以补齐与桌面 / Headless 面板的内容量级 -->
                <div class="install__note">
                  <h4 class="install__note-title">{{ t.install.mobile.continuity.title }}</h4>
                  <p class="install__note-body">{{ t.install.mobile.continuity.body }}</p>
                </div>
                <div class="install__note">
                  <h4 class="install__note-title">{{ t.install.mobile.waitlistNote.title }}</h4>
                  <p class="install__note-body">{{ t.install.mobile.waitlistNote.body }}</p>
                </div>
                <div class="install__main-foot">
                  <button
                    class="dl-btn dl-btn--primary dl-btn--lg install__action"
                    type="button"
                    @click="onWaitlist"
                  >
                    {{ t.install.mobile.joinWaitlist }}
                  </button>
                  <p class="install__reading dl-mono">{{ mobileReading }}</p>
                </div>
              </div>
              <span class="install__col-divider" aria-hidden="true" />
              <div class="install__aside">
                <dl class="install__facts">
                  <div class="install__fact">
                    <dt>{{ t.install.mobile.facts.platform }}</dt>
                    <dd v-for="platform in mobilePlatforms" :key="platform.id">
                      {{ t.install.mobile.platforms[platform.id] }}
                    </dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.mobile.facts.store }}</dt>
                    <dd v-for="platform in mobilePlatforms" :key="platform.id">
                      {{ t.install.mobile.stores[platform.id] }}
                    </dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.mobile.facts.status }}</dt>
                    <dd>{{ t.install.mobile.comingSoon }}</dd>
                  </div>
                  <div class="install__fact">
                    <dt>{{ t.install.mobile.facts.requirements }}</dt>
                    <dd v-for="platform in mobilePlatforms" :key="platform.id" class="dl-mono">
                      {{ t.install.mobile.requirementsValue[platform.id] }}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 区块底色:整页深色延续;与上方分栏区之间用一条发丝线分区 */
.install {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

/* 仪器外框:1px strong 档描边 + 大圆角,不叠阴影(层级只由描边承担);
   圆角只圆外围这一圈,内部线格一律直角;格内底不抬升,与页面同底 */
.install__frame {
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-lg);
}

/* 表头:Tab 行左对齐,内边距与面板内容同源(48px);下缘贯通横线,
   这条线同时是下方面板内容的起始线 */
.install__head {
  padding-inline: var(--dl-space-12);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

/* 标签栏:flex 行、左对齐(tab 宽度各自适应内容 —— 带检测小标,不做等宽格);
   装不下时退化为左起可横向滚动,溢出端挂渐隐遮罩(≤720px,见下) */
.install__tablist {
  position: relative;
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  /* 实测写入短线的初始值:挂载测量前短线不可见(宽度 0),不会出现错位闪烁 */
  --indicator-x: 0px;
  --indicator-w: 0px;
  /* 激活对齐(scrollActiveTabIntoView)时保留的横向 gutter;
     ≤720 加宽到 space-12 与渐隐遮罩同宽(见下方媒体查询) */
  scroll-padding-inline: var(--dl-space-2);
}

.install__tablist::-webkit-scrollbar {
  display: none;
}

/* 中性短线:2px(--dl-border-width 派生一档加粗),向下探出 1px 骑在表头线上;
   宽度 / 位置由 JS 实测写入,切换时纯 transform 平移。
   不用青瓷 —— 首屏青瓷短线已占配额,此处几何位置承担定位、颜色不承担语义 */
.install__indicator {
  position: absolute;
  inset-block-end: calc(-1 * var(--dl-border-width));
  inset-inline-start: 0;
  width: var(--indicator-w);
  block-size: calc(var(--dl-border-width) * 2);
  background-color: var(--dl-border-strong);
  transform: translateX(var(--indicator-x));
  transition: transform var(--dl-duration-base) var(--dl-ease-standard);
}

/* Tab:图标 + 名称 / 极简说明两行;首个 tab 的左 padding 归零,
   使 tab 内容(图标)左缘与面板内容左缘(外框内 48px)同轴。
   选择器必须是 :first-of-type 而不是 :first-child —— tablist 的第一个
   元素子节点是 .install__indicator(装饰 span),:first-child 永远匹配不到
   首个 button;tab 是标签栏里唯一的 button 类型,:first-of-type 稳定命中 */
.install__tab {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  min-height: var(--dl-target-size);
  padding-block: var(--dl-space-2);
  padding-inline: var(--dl-space-4);
  color: var(--dl-text-secondary);
  white-space: nowrap;
  transition: color var(--dl-duration-base) var(--dl-ease-standard);
}

.install__tab:first-of-type {
  padding-inline-start: 0;
}

.install__tab:hover {
  color: var(--dl-text-primary);
}

/* 活动标签:文字提到一级 + 字重 500,与下方中性短线构成双通道(位置 + 字档),
   不只靠颜色区分 */
.install__tab[aria-selected='true'] {
  color: var(--dl-text-primary);
  font-weight: 500;
}

.install__tab-text {
  display: grid;
  justify-items: start;
  text-align: left;
}

.install__tab-label {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-snug);
}

/* 标签下的极简说明(≥1024px 显示):标签行同时承担「枚举 + 选择」,
   让三个目标不切 Tab 也可辨认;活动 tab 的说明提到二级色,随主文字一档 */
.install__tab-hint {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

.install__tab[aria-selected='true'] .install__tab-hint {
  color: var(--dl-text-secondary);
}

/* 「你的系统」小标:检测命中的 Tab 右端,小号 + 大写 + 微型字距;
   中性描边 pill,不上青瓷 —— 高亮由「存在性」承担,不消耗配额 */
.install__current {
  padding-block: var(--dl-space-1);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-secondary);
  white-space: nowrap;
}

/* 面板容器:三面板叠在同一 grid 单元格,容器高度自动等于最高面板,
   切换无跳动,不写死高度 */
.install__panels {
  display: grid;
}

.install__panel {
  grid-area: 1 / 1;
  min-width: 0;
  /* 切换动效:淡入淡出 + 极小位移,只动 transform / opacity;
     visibility 同步过渡:隐藏侧淡出完成后才置 hidden,显示侧立即占位渐显 */
  opacity: 0;
  visibility: hidden;
  transform: translateY(var(--dl-space-3));
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard),
    visibility var(--dl-duration-base) var(--dl-ease-standard);
}

.install__panel--active {
  opacity: 1;
  visibility: visible;
  transform: none;
}

/* 面板两列:左列钉在正文行宽(35em),右列吸收剩余宽度;
   列间距 48px,中间一条 1px 竖线(上下留端点);内边距 48px。
   align-items:start —— 列保持自然高度,容器 = 最高面板的留白落在面板底部 */
.install__panel-inner {
  display: grid;
  grid-template-columns: minmax(0, var(--dl-measure)) var(--dl-border-width) minmax(0, 1fr);
  column-gap: var(--dl-space-12);
  align-items: start;
  padding: var(--dl-space-12);
}

/* 列间竖线:上下各留 24px 端点(home-split 分隔线同款「线有端点」),
   高度随所在行(左列 / 右列中较高者)拉伸 */
.install__col-divider {
  justify-self: center;
  align-self: stretch;
  width: var(--dl-border-width);
  margin-block: var(--dl-space-6);
  background-color: var(--dl-border-base);
}

/* 左列:行动路径。块间距 32px(眉标组 / 控件组 / 说明段 / 行动组之间),
   组内间距 12px */
.install__main {
  display: grid;
  gap: var(--dl-space-8);
  align-content: start;
  justify-items: start;
}

.install__main-head {
  display: grid;
  gap: var(--dl-space-3);
  justify-items: start;
}

/* 眉标读数:等宽 xs uppercase,目标 slug + 部署面的技术标识 */
.install__eyebrow {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-tertiary);
}

/* 目标名:23px / 600(本区块的锚点字号) */
.install__target-name {
  font-size: var(--dl-font-size-xl);
  line-height: var(--dl-line-tight);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.install__target-summary {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 桌面面板专属:平台与架构两个分段控件上下堆叠、各自左对齐;
   每个控件带一行小 caption(视觉标签 aria-hidden,无障碍名由控件自身的
   aria-label 承担,避免重复播报) */
.install__fields {
  display: grid;
  gap: var(--dl-space-4);
  justify-items: start;
}

.install__field {
  display: grid;
  gap: var(--dl-space-2);
  justify-items: start;
}

.install__field-label {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

/* 移动端面板的说明段:与桌面端的关系 / 等待列表后果 */
.install__note {
  display: grid;
  gap: var(--dl-space-2);
}

.install__note-title {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.install__note-body {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 行动组:全列宽主按钮 + 等宽读数小字 */
.install__main-foot {
  display: grid;
  gap: var(--dl-space-3);
  justify-items: start;
  justify-self: stretch;
}

.install__action {
  width: 100%;
}

/* 底部读数:等宽 xs 三级色(版本 · 系统要求 / 依赖 · 安装位置 / 最低版本) */
.install__reading {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

/* 右列:事实承载区。块间距 32px(命令区与事实格之间) */
.install__aside {
  display: grid;
  gap: var(--dl-space-8);
  align-content: start;
}

/* 事实格:共享边线格语言 —— 容器底色即线色、gap 取线宽、格内底不抬升、
   一律直角,与 quickstart 同源;两列,窄屏降一列,≥1440 升三列 */
.install__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-border-width);
  background-color: var(--dl-border-base);
}

.install__fact {
  display: grid;
  gap: var(--dl-space-2);
  align-content: start;
  padding: var(--dl-space-6);
  background-color: var(--dl-bg-base);
}

/* 格标签:xs + 微型字距 + 三级色(仪器读数语言;中文不受 uppercase 影响) */
.install__fact dt {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-tertiary);
}

.install__fact dd {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
}

/* 格内成句的说明(前置条件等):小一档、正文行高、二级色 */
.install__fact dd.install__fact-prose {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 行内命令:等宽 + 下沉底小胶囊,与代码块同族 */
.install__inline-code {
  padding-block: var(--dl-space-1);
  padding-inline: var(--dl-space-2);
  background-color: var(--dl-bg-sunken);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
}

/* 命令区:满右列宽。单列轨道显式 minmax(0, 1fr):auto 轨道在 WebKit 下
   会按内容最大宽撑开(命令不换行),1fr 把轨道钉在右列宽度上 */
.install__command-area {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--dl-space-2);
}

.install__command-caption {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-tertiary);
}

/* 代码块:下沉底 + strong 发丝描边,不做拟真终端 chrome;
   横向两格 flex:代码区(独立横向滚动)与复制按钮(固定格,不参与滚动)。
   文字只在代码区内滚动并被其裁剪,物理上不可能与按钮交叠 —— 不靠加大
   padding 治标(初始 scrollLeft=0 时 padding 治不了重叠)。 */
.install__code-wrap {
  display: flex;
  align-items: center;
  /* grid 子项默认 min-width:auto,命令的最大内容宽会把框撑出右列 ——
     显式 min-width:0,让框守住右列宽度、溢出交给代码区滚动 */
  min-width: 0;
  background-color: var(--dl-bg-sunken);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
}

.install__code {
  /* flex:1 + min-width:0:占满按钮之外的宽度,且允许收缩到内容以下 */
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  padding-block: var(--dl-space-4);
  padding-inline-start: var(--dl-space-4);
  /* 滚到最右时命令末段与按钮之间留一息空隙 */
  padding-inline-end: var(--dl-space-2);
  overflow-x: auto;
}

/* $ 提示符:与命令同字号,用三级色区分(语义外的装饰色一律不上) */
.install__prompt {
  flex: none;
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
  user-select: none;
}

/* 命令:等宽 15px(命令块是本区块的锚点之一);满宽后不再需要横向滚动,
   窄屏仍横向滚动而不是压缩字号 */
.install__command {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
  white-space: nowrap;
}

/* 复制按钮:代码块右侧的固定格;命中区取 --dl-target-size(44×44),
   视觉字形仍是 icon-sm(16px)—— 命中区与视觉尺寸解耦;
   默认三级色 → hover 一级;成功态只换字形,不上色 */
.install__copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  margin-inline-end: var(--dl-space-1);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-tertiary);
  transition: color var(--dl-duration-fast) var(--dl-ease-standard);
}

.install__copy:hover {
  color: var(--dl-text-primary);
}

/* 复制状态播报:常驻 DOM;空文本时按行高预留一整行(min-height 必须乘上
   行高 —— 只写 1em 会矮一截,填入文字时把全页往下顶),点击反馈不引发布局跳动 */
.install__copy-status {
  min-height: calc(1em * var(--dl-line-snug));
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

@media (min-width: 1440px) {
  /* 右列 ≥674px 时事实格升三列:两列下格宽近 400px,而 dd 实测最宽 ~155px
     (占不到一半),每格右半全空;三列后格宽 ~224px 仍容得下最长读数。
     升列只让右列变矮,面板高度由左列(35em 行动路径)接管,三面板齐平不受影响 */
  .install__facts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1023px) {
  /* 面板降单列(与 home-split 同断点):左列在上、右列在下;
     列间竖线转为横线,左右留端点 */
  .install__panel-inner {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--dl-space-8);
  }

  .install__col-divider {
    width: auto;
    height: var(--dl-border-width);
    margin-block: 0;
    margin-inline: var(--dl-space-6);
    justify-self: stretch;
  }

  /* 标签下的极简说明只在 ≥1024px 显示;窄屏 tab 回到单行 */
  .install__tab-hint {
    display: none;
  }
}

@media (max-width: 720px) {
  /* 窄屏:外框内边距收一档(48px 在 375px 下只剩 229px 内容宽),给内容让出行宽 */
  .install__head {
    padding-inline: var(--dl-space-6);
  }

  .install__panel-inner {
    padding: var(--dl-space-6);
  }

  /* 事实格降一列,线只在格与格之间 */
  .install__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 标签条横向溢出可用性:恢复细滚动条(鼠标可拖拽;Chromium 的 overlay
     滚动条不占位,存在性暗示主要由渐隐遮罩承担),溢出端挂渐隐遮罩
     (由 JS 按 scrollLeft / 可滚余量加类)。渐隐宽度与激活对齐的 gutter
     同源取 space-12:激活对齐保证左侧邻居露出的残段恰好 ≤ gutter,
     完整落在渐隐区内 —— 渐隐宽度必须 ≥ gutter,否则残段超出渐隐区,
     留下半截实体文字的碎片(m2)。
     滑块颜色用 --dl-text-disabled(弱化前景):border 档在 4px 高度上
     与页面底对比过低,实际上看不见 */
  .install__tablist {
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--dl-text-disabled) transparent;
    /* 激活对齐(scrollActiveTabIntoView)时保留的横向 gutter,与渐隐同宽 */
    scroll-padding-inline: var(--dl-space-12);
  }

  .install__tablist::-webkit-scrollbar {
    display: block;
    height: var(--dl-space-1);
  }

  .install__tablist::-webkit-scrollbar-thumb {
    background-color: var(--dl-text-disabled);
    border-radius: var(--dl-radius-pill);
  }

  .install__tablist::-webkit-scrollbar-track {
    background-color: transparent;
  }

  /* 溢出端渐隐遮罩:渐变里的 #000 只取 alpha 通道参与遮罩,不是视觉颜色;
     渐隐宽度 space-12,与上面的 scroll-padding gutter 同源(见上注) */
  .install__tablist--overflow-end {
    -webkit-mask-image: linear-gradient(
      to right,
      #000 calc(100% - var(--dl-space-12)),
      transparent
    );
    mask-image: linear-gradient(to right, #000 calc(100% - var(--dl-space-12)), transparent);
  }

  .install__tablist--overflow-start {
    -webkit-mask-image: linear-gradient(
      to left,
      #000 calc(100% - var(--dl-space-12)),
      transparent
    );
    mask-image: linear-gradient(to left, #000 calc(100% - var(--dl-space-12)), transparent);
  }

  .install__tablist--overflow-start.install__tablist--overflow-end {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--dl-space-12),
      #000 calc(100% - var(--dl-space-12)),
      transparent
    );
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--dl-space-12),
      #000 calc(100% - var(--dl-space-12)),
      transparent
    );
  }
}
</style>
