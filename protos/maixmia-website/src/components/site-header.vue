<script setup lang="ts">
// 顶栏:首页与工作台共用深色 sticky;登录直接同步切换到工作台。
import { NConfigProvider } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { darkOverrides } from '../theme'
import { useI18n } from '../i18n'
import { isAuthenticated, signIn } from '../auth/session'
import { currentRoute, navigateTo } from '../router'
import LanguageSwitcher from './language-switcher.vue'
import AccountMenu from './account-menu.vue'

const { t } = useI18n()
const loginRef = ref<HTMLButtonElement | null>(null)

// ---- 整站顶栏的折叠(只作用于**工作台页**;首页的顶栏常驻)----
//
// 依据:
//   · Microsoft Paint(Windows 11,2025)刚上线的就是同一模式:工具栏边缘一枚 chevron 控制折叠,
//     **折叠后留一个临时的「显示工具栏」按钮**保证回得来 —— 本组件的控件于是两种状态下都留在
//     边界上(展开时三角形朝上、折叠时朝下),不会出现「收起来就找不回来」。
//   · W3C 的 aria-expanded 技术要求折叠控件暴露状态,且**只有显式激活才改变**(不靠悬停 / 聚焦触发)——
//     故它是一个真 button,靠 click 切换。
// 状态是**视图状态**(刷新即重置),与仓库约定一致。
const isCollapsed = ref(false)
// 只有工作台页提供折叠(首页的整站 Header 保持常驻)。
const canCollapse = computed(() => currentRoute.value.page === 'workspace')
const isCollapsedNow = computed(() => canCollapse.value && isCollapsed.value)

function toggleHeader(): void {
  // 显式激活才切换(不响应悬停 / 聚焦)。
  isCollapsed.value = !isCollapsed.value
}

// 顶栏「当场」的高度交给页面:一个 token 而非直接改 --dl-header-height(那是设计常量,别处按它算间距)。
function syncHeaderHeight(): void {
  document.documentElement.style.setProperty('--dl-header-height-current', isCollapsedNow.value ? '0px' : 'var(--dl-header-height)')
}

watch(isCollapsedNow, syncHeaderHeight, { immediate: true })
// 离开工作台(回首页)时顶栏必须恢复常驻,否则首页会缺一截。
watch(canCollapse, (can) => { if (!can) isCollapsed.value = false })
onBeforeUnmount(() => { document.documentElement.style.removeProperty('--dl-header-height-current') })

function onLogin(): void {
  signIn()
  navigateTo('workspace')
}

async function onSignedOut(): Promise<void> {
  await nextTick()
  loginRef.value?.focus()
}
</script>

<template>
  <!-- abstract:让 n-config-provider 不渲染包裹节点。它默认会渲染一个高度与顶栏相同的
       div,sticky 元素无法越出父盒 —— 父盒与自身等高则没有可粘的余量,sticky 会
       退化成 static,页面一滚顶栏就跟着滚走。主题经 Vue 的 provide/inject 传递,
       那层 div 只带一个类名、不承载样式,因此去掉它不影响 Naive 组件的主题。 -->
  <n-config-provider abstract :theme-overrides="darkOverrides">
    <header id="top" class="site-header dl-scope dl-scope--dark" :class="{ 'is-collapsed': isCollapsedNow }">
      <!-- 折叠态下顶栏内的链接 / 控件必须离开可达性树与 Tab 序(inert 同时管住两者),
           否则键盘用户会 tab 进看不见的控件。折叠控件本身在 header 上、不在这一层里。 -->
      <div id="site-header-inner" class="site-header__inner" :inert="isCollapsedNow">
        <a class="site-header__brand" href="#top" aria-label="Mia">
          <span class="site-header__mark" aria-hidden="true">M</span>
          <span class="site-header__word">Mia</span>
        </a>

        <div class="site-header__actions">
          <LanguageSwitcher />
          <AccountMenu v-if="isAuthenticated" @signed-out="onSignedOut" />
          <button v-else ref="loginRef" class="dl-btn dl-btn--primary" type="button" @click="onLogin">
            {{ t.nav.login }}
          </button>
        </div>
      </div>
      <!-- 折叠控件:真 button + aria-expanded + aria-controls;可见记号是一枚**很小的三角**,
           命中区按本仓独立控件的下限 44×44。它贴在顶栏下边缘的左侧(那里在两种状态下都不与
           工作台自身的控件(Agent 切换器 / 汉堡 / 会话 tab)抢命中区)。 -->
      <button
        v-if="canCollapse"
        type="button"
        class="site-header__collapse"
        :aria-expanded="!isCollapsedNow"
        aria-controls="site-header-inner"
        :aria-label="isCollapsedNow ? t.nav.expandHeader : t.nav.collapseHeader"
        @click="toggleHeader"
      >
        <span class="site-header__collapse-mark" aria-hidden="true" />
      </button>
    </header>
  </n-config-provider>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: var(--dl-z-sticky);
  border-bottom: var(--dl-border-width) solid var(--dl-border-subtle);
}

/* 顶栏刻意不套 .dl-container:它是 chrome 不是正文,只借外壳 gutter 贴视口两侧,
   若继承 1520px 上限,宽屏下品牌与账号会向内塌、两侧留下大片空白。
   正文内容仍由 .dl-container 限宽居中(见 style.css 的 --dl-chrome-gutter)。 */
.site-header__inner {
  display: flex;
  align-items: center;
  gap: var(--dl-space-6);
  height: var(--dl-header-height);
  padding-inline: var(--dl-chrome-gutter);
}

/* 折叠态:内层高度归 0(顶栏整条收起),下边那条发丝线也一并去掉 —— 否则顶栏仍占 1px。
   **显式 transition: none** —— 折叠是布局变化,而本仓动效白名单只允许 transform / opacity
   (Bootstrap 那类库会过渡 height,本仓不这么做);只有三角的旋转有过渡。 */
.site-header__inner {
  transition: none;
}

.site-header.is-collapsed .site-header__inner {
  block-size: 0;
  overflow: hidden;
}

.site-header.is-collapsed {
  border-block-end-width: 0;
}

/* 折叠控件:贴顶栏下边缘、**水平居中** —— 顶栏中间是唯一空着的一带(左端是品牌、右端是语言与
   账号控件),横向又正好避开它们的命中区。命中区 44×44,可见只有一枚 8×4 的小三角。
   展开时它在顶栏内(底边与顶栏下边缘齐平);折叠后顶栏高 0,它改为顶在顶栏上边缘 ——
   两种状态下都留在边界上,即 Paint 那条「折叠后仍留一个显示按钮」的先例。 */
.site-header__collapse {
  position: absolute;
  inset-block-end: 0;
  inset-inline-start: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
  padding-block-end: var(--dl-space-1);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-tertiary);
}

.site-header.is-collapsed .site-header__collapse {
  inset-block-end: auto;
  inset-block-start: 0;
  align-items: flex-start;
  padding-block: var(--dl-space-1) 0;
}

.site-header__collapse:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.site-header__collapse:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 小三角:纯 CSS 画(上尖),折叠后旋转 180°。**只有 transform 有过渡**(动效白名单)。 */
.site-header__collapse-mark {
  inline-size: 0;
  block-size: 0;
  border-inline: var(--dl-space-1) solid transparent;
  border-block-end: var(--dl-space-1) solid currentColor;
  transition: transform var(--dl-duration-base) var(--dl-ease-standard);
}

.site-header.is-collapsed .site-header__collapse-mark {
  transform: rotate(180deg);
}

.site-header__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-weight: 600;
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-primary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
}

.site-header__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-icon-lg);
  height: var(--dl-icon-lg);
  border-radius: var(--dl-radius-sm);
  background-color: var(--dl-accent);
  color: var(--dl-text-on-accent);
  font-size: var(--dl-font-size-sm);
  font-weight: 600;
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  margin-inline-start: auto;
}

</style>
