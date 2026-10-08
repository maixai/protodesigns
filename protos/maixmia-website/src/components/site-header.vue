<script setup lang="ts">
// 顶栏:深色 sticky。仅保留品牌字标、语言切换与登录按钮(无导航项、无抽屉);
// 登录暂不接流程,点击弹轻提示(避免假交互),消息容器由根部 n-message-provider
// Teleport 到 body,不参与文档流,不影响 sticky。
import { NConfigProvider, NDropdown, useMessage } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import type { HTMLAttributes } from 'vue'
import { darkOverrides } from '../theme'
import { useI18n } from '../i18n'
import type { Locale } from '../i18n'

const { t, locale, setLocale } = useI18n()
const message = useMessage()

const languageOptions = [
  { label: '中文', key: 'zh-CN' },
  { label: 'English', key: 'en' },
]

// NDropdown 默认不输出任何 ARIA 角色(选项是普通 div,无障碍树里只剩 StaticText)。
// 用官方 menu-props / node-props(2.31.0 / 2.29.1 引入)注入 menu 语义:
// 语言切换是单选,选项用 menuitemradio + aria-checked 反映当前语言。
// (Naive 要求返回类型带索引签名,故 aria-checked 用字符串而非布尔。)
type DropdownAttrs = HTMLAttributes & Record<string, string | number | undefined>

function dropdownMenuProps(): DropdownAttrs {
  return { role: 'menu' }
}

function dropdownNodeProps(option: DropdownOption): DropdownAttrs {
  return {
    role: 'menuitemradio',
    'aria-checked': option.key === locale.value ? 'true' : 'false',
  }
}

function onSelectLanguage(key: string | number): void {
  if (key === 'zh-CN' || key === 'en') setLocale(key as Locale)
}

function onLogin(): void {
  message.info(t.value.nav.loginHint)
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
          <n-dropdown
            trigger="click"
            :options="languageOptions"
            :menu-props="dropdownMenuProps"
            :node-props="dropdownNodeProps"
            @select="onSelectLanguage"
          >
            <button class="site-header__lang" type="button" :aria-label="t.nav.language">
              {{ locale === 'zh-CN' ? '中文' : 'EN' }}
            </button>
          </n-dropdown>
          <button class="dl-btn dl-btn--primary" type="button" @click="onLogin">
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
</style>
