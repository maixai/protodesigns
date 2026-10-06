<script setup lang="ts">
// 页脚:深色,字标 + 一句话 + 锚点链接列 + 语言切换 + 版权。
import { computed } from 'vue'
import { useI18n } from '../i18n'
import type { Locale } from '../i18n'

const { t, locale, setLocale } = useI18n()

const navItems = computed(() => [
  { href: '#form-factors', label: t.value.nav.formFactors },
  { href: '#anywhere', label: t.value.nav.anywhere },
  { href: '#share', label: t.value.nav.share },
  { href: '#config', label: t.value.nav.config },
])

const languages: readonly { key: Locale; label: string }[] = [
  { key: 'zh-CN', label: '中文' },
  { key: 'en', label: 'English' },
]
</script>

<template>
  <footer class="site-footer dl-scope dl-scope--dark">
    <div class="dl-container site-footer__inner">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <a class="site-footer__wordmark" href="#top" aria-label="Mia">
            <span class="site-footer__mark" aria-hidden="true">M</span>
            <span>Mia</span>
          </a>
          <p class="site-footer__tagline">{{ t.footer.tagline }}</p>
        </div>

        <nav class="site-footer__col" :aria-label="t.footer.navTitle">
          <h2 class="site-footer__col-title">{{ t.footer.navTitle }}</h2>
          <a
            v-for="item in navItems"
            :key="item.href"
            class="site-footer__link"
            :href="item.href"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="site-footer__col">
          <h2 class="site-footer__col-title">{{ t.footer.languageTitle }}</h2>
          <div class="site-footer__langs" role="group" :aria-label="t.footer.languageTitle">
            <button
              v-for="lang in languages"
              :key="lang.key"
              type="button"
              class="site-footer__lang"
              :aria-pressed="locale === lang.key"
              @click="setLocale(lang.key)"
            >
              {{ lang.label }}
            </button>
          </div>
        </div>
      </div>

      <div class="site-footer__bottom">
        <p class="site-footer__copyright dl-mono">{{ t.footer.copyright }}</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
  padding-block: calc(var(--dl-space-12) + var(--dl-space-8)) var(--dl-space-8);
}

.site-footer__grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--dl-space-8);
}

.site-footer__brand {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  justify-items: start;
}

.site-footer__wordmark {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-weight: 600;
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-primary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
}

.site-footer__mark {
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

.site-footer__tagline {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
  max-width: var(--dl-measure);
}

.site-footer__col {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  justify-items: start;
}

.site-footer__col-title {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-tertiary);
}

.site-footer__link {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
  transition: color var(--dl-duration-fast) var(--dl-ease-standard);
}

.site-footer__link:hover {
  color: var(--dl-text-primary);
}

.site-footer__langs {
  display: flex;
  gap: var(--dl-space-2);
}

.site-footer__lang {
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

.site-footer__lang:hover {
  background-color: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.site-footer__lang[aria-pressed='true'] {
  border-color: var(--dl-accent);
  color: var(--dl-accent);
}

.site-footer__bottom {
  margin-top: calc(var(--dl-space-12));
  padding-top: var(--dl-space-6);
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

.site-footer__copyright {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

@media (max-width: 720px) {
  .site-footer__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--dl-space-6);
  }
}
</style>
