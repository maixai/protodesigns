<script setup lang="ts">
// 顶栏:深色 sticky。窄屏导航折叠为菜单按钮 + Naive 抽屉;语言切换走 Naive 下拉。
import { computed, ref } from 'vue'
import { NConfigProvider, NDrawer, NDrawerContent, NDropdown } from 'naive-ui'
import { darkOverrides } from '../theme'
import { useI18n } from '../i18n'
import type { Locale } from '../i18n'

const { t, locale, setLocale } = useI18n()

const isMenuOpen = ref(false)

const navItems = computed(() => [
  { href: '#form-factors', label: t.value.nav.formFactors },
  { href: '#anywhere', label: t.value.nav.anywhere },
  { href: '#share', label: t.value.nav.share },
  { href: '#config', label: t.value.nav.config },
])

const languageOptions = [
  { label: '中文', key: 'zh-CN' },
  { label: 'English', key: 'en' },
]

function onSelectLanguage(key: string | number): void {
  if (key === 'zh-CN' || key === 'en') setLocale(key as Locale)
}

function closeMenu(): void {
  isMenuOpen.value = false
}
</script>

<template>
  <!-- abstract:让 n-config-provider 不渲染包裹节点。它默认会渲染一个高度与顶栏相同的
       div,该 div 就是 sticky 的包含块 —— 包含块与自身等高则没有可粘的余量,sticky 会
       退化成 static,页面一滚顶栏就跟着滚走。主题经 Vue 的 provide/inject 传递,
       那层 div 只带一个类名、不承载样式,因此去掉它不影响 Naive 组件的主题。 -->
  <n-config-provider abstract :theme-overrides="darkOverrides">
    <header id="top" class="site-header dl-scope dl-scope--dark">
      <div class="dl-container site-header__inner">
        <a class="site-header__brand" href="#top" aria-label="Mia">
          <span class="site-header__mark" aria-hidden="true">M</span>
          <span class="site-header__word">Mia</span>
        </a>

        <nav class="site-header__nav" :aria-label="t.nav.menu">
          <a v-for="item in navItems" :key="item.href" class="site-header__link" :href="item.href">
            {{ item.label }}
          </a>
        </nav>

        <div class="site-header__actions">
          <n-dropdown
            trigger="click"
            :options="languageOptions"
            @select="onSelectLanguage"
          >
            <button class="site-header__lang" type="button" :aria-label="t.nav.language">
              {{ locale === 'zh-CN' ? '中文' : 'EN' }}
            </button>
          </n-dropdown>
          <a class="dl-btn dl-btn--primary site-header__cta" href="#quickstart">
            {{ t.nav.cta }}
          </a>
          <button
            class="site-header__menu"
            type="button"
            :aria-label="t.nav.menu"
            :aria-expanded="isMenuOpen"
            @click="isMenuOpen = true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      <n-drawer v-model:show="isMenuOpen" placement="right" :width="300">
        <n-drawer-content :title="t.nav.menu" closable body-content-class="site-drawer__body">
          <a
            v-for="item in navItems"
            :key="item.href"
            class="site-header__drawer-link"
            :href="item.href"
            @click="closeMenu"
          >
            {{ item.label }}
          </a>
          <div class="site-header__drawer-lang" role="group" :aria-label="t.nav.language">
            <button
              v-for="option in languageOptions"
              :key="option.key"
              type="button"
              class="site-header__drawer-lang-btn"
              :aria-pressed="locale === option.key"
              @click="onSelectLanguage(option.key)"
            >
              {{ option.label }}
            </button>
          </div>
          <a class="dl-btn dl-btn--primary" href="#quickstart" @click="closeMenu">
            {{ t.nav.cta }}
          </a>
        </n-drawer-content>
      </n-drawer>
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

.site-header__nav {
  display: flex;
  align-items: center;
  gap: var(--dl-space-6);
  margin-inline-start: auto;
}

.site-header__link {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
  transition: color var(--dl-duration-fast) var(--dl-ease-standard);
}

.site-header__link:hover {
  color: var(--dl-text-primary);
}

.site-header__actions {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
}

.site-header__lang {
  min-height: var(--dl-control-height);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  transition:
    background-color var(--dl-duration-fast) var(--dl-ease-standard),
    color var(--dl-duration-fast) var(--dl-ease-standard);
}

.site-header__lang:hover {
  background-color: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.site-header__menu {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
}

.site-header__menu svg {
  width: var(--dl-icon-md);
  height: var(--dl-icon-md);
  stroke-width: var(--dl-icon-stroke);
}

.site-header__drawer-link {
  padding-block: var(--dl-space-2);
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-primary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
}

.site-header__drawer-lang {
  display: flex;
  gap: var(--dl-space-2);
  padding-block: var(--dl-space-2);
}

.site-header__drawer-lang-btn {
  min-height: var(--dl-control-height);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

.site-header__drawer-lang-btn[aria-pressed='true'] {
  border-color: var(--dl-accent);
  color: var(--dl-accent);
}

/* 窄屏:导航折叠为菜单按钮 + 抽屉 */
@media (max-width: 900px) {
  .site-header__nav {
    display: none;
  }

  .site-header__actions {
    margin-inline-start: auto;
  }

  .site-header__menu {
    display: inline-flex;
  }
}

@media (min-width: 901px) {
  .site-header__actions {
    margin-inline-start: 0;
  }
}

@media (max-width: 640px) {
  .site-header__cta {
    display: none;
  }
}
</style>
