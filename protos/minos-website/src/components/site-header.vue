<script setup lang="ts">
// 首页与控制台共用顶栏;未登录入口与账户菜单互斥,登录直接进入控制台。
import { nextTick, ref } from 'vue'
import { isAuthenticated, signIn } from '../auth/session'
import { currentRoute, navigateTo } from '../router'
import AccountMenu from './account-menu.vue'
import { useI18n } from '../i18n'
import LanguageSwitcher from './language-switcher.vue'

const { t } = useI18n()
const loginRef = ref<HTMLButtonElement | null>(null)

function onLogin(): void {
  signIn()
  navigateTo('console')
}

// 确认登出后账户触发钮被移除,焦点移交给替代它的登录入口。
async function onSignedOut(): Promise<void> {
  await nextTick()
  loginRef.value?.focus()
}
</script>

<template>
  <header id="top" class="site-header">
    <div class="dl-container site-header__inner">
      <a class="site-header__brand" :href="currentRoute.page === 'home' ? '#top' : '#/'" aria-label="Minos">
        <!-- 几何节点记号:三节点两两相连的三角形,内联 SVG,不引入图标库 -->
        <svg
          class="site-header__mark"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <g stroke="currentColor" stroke-width="var(--dl-icon-stroke)" stroke-linecap="round">
            <path d="M5.5 18.5L12 6l6.5 12.5M5.5 18.5h13" />
          </g>
          <g fill="currentColor">
            <circle cx="5.5" cy="18.5" r="2.1" />
            <circle cx="12" cy="6" r="2.1" />
            <circle cx="18.5" cy="18.5" r="2.1" />
          </g>
        </svg>
        <span class="site-header__word">Minos</span>
      </a>

      <div class="site-header__actions">
        <LanguageSwitcher />
        <AccountMenu v-if="isAuthenticated" @signed-out="onSignedOut" />
        <button v-else ref="loginRef" class="dl-btn dl-btn--primary" type="button" @click="onLogin">
          {{ t.nav.login }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: var(--dl-z-sticky);
  background-color: var(--dl-bg-base);
  border-bottom: var(--dl-border-width) solid var(--dl-border-subtle);
}

.site-header__inner {
  display: flex;
  align-items: center;
  gap: var(--dl-space-6);
  height: var(--dl-header-height);
}

.site-header__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  /* 品牌链接也是可点元素,命中区须达指针目标下限 */
  min-height: var(--dl-target-size);
  font-weight: 600;
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-primary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
}

.site-header__mark {
  width: var(--dl-icon-lg);
  height: var(--dl-icon-lg);
  color: var(--dl-accent);
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  margin-inline-start: auto;
}

/* 顶栏按钮:命中区达指针目标下限(元素本体,不靠伪元素外扩) */
.site-header__actions .dl-btn {
  min-height: var(--dl-target-size);
}

/* 窄屏:三件套(字标 / 语言 / 登录)必须放得下,收紧横向节奏 */
@media (max-width: 560px) {
  .site-header__inner {
    gap: var(--dl-space-3);
  }

  .site-header__actions {
    gap: var(--dl-space-2);
  }
}
</style>
