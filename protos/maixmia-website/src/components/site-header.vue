<script setup lang="ts">
// 顶栏:首页与工作台共用深色 sticky;登录直接同步切换到工作台。
import { NConfigProvider } from 'naive-ui'
import { nextTick, ref } from 'vue'
import { darkOverrides } from '../theme'
import { useI18n } from '../i18n'
import { isAuthenticated, signIn } from '../auth/session'
import { navigateTo } from '../router'
import LanguageSwitcher from './language-switcher.vue'
import AccountMenu from './account-menu.vue'

const { t } = useI18n()
const loginRef = ref<HTMLButtonElement | null>(null)

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
    <header id="top" class="site-header dl-scope dl-scope--dark">
      <div class="dl-container site-header__inner">
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
