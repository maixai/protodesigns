<script setup lang="ts">
// 页脚:浅色,字标 + 一句话 + 锚点链接列 + 版权。语言切换器在顶栏。
import { computed } from 'vue'
import { useI18n } from '../i18n'

const { t } = useI18n()

// 锚点链接只指向页内真实存在的区块,不做死链接。
const navItems = computed(() => [
  { href: '#compare', label: t.value.footer.links.compare },
  { href: '#capabilities', label: t.value.footer.links.capabilities },
  { href: '#mesh', label: t.value.footer.links.mesh },
  { href: '#quickstart', label: t.value.footer.links.quickstart },
])
</script>

<template>
  <footer class="site-footer">
    <div class="dl-container site-footer__inner">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <a class="site-footer__wordmark" href="#top" aria-label="Minos">
            <svg class="site-footer__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <g stroke="currentColor" stroke-width="var(--dl-icon-stroke)" stroke-linecap="round">
                <path d="M5.5 18.5L12 6l6.5 12.5M5.5 18.5h13" />
              </g>
              <g fill="currentColor">
                <circle cx="5.5" cy="18.5" r="2.1" />
                <circle cx="12" cy="6" r="2.1" />
                <circle cx="18.5" cy="18.5" r="2.1" />
              </g>
            </svg>
            <span>Minos</span>
          </a>
          <p class="site-footer__tagline">{{ t.footer.tagline }}</p>
        </div>

        <nav class="site-footer__col" :aria-label="t.footer.navTitle">
          <p class="site-footer__col-title">{{ t.footer.navTitle }}</p>
          <a
            v-for="item in navItems"
            :key="item.href"
            class="site-footer__link"
            :href="item.href"
          >
            {{ item.label }}
          </a>
        </nav>
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
  background-color: var(--dl-bg-elevated);
  padding-block: calc(var(--dl-space-12) + var(--dl-space-8)) var(--dl-space-8);
}

.site-footer__grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
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
  /* 可点元素,命中区须达指针目标下限 */
  min-height: var(--dl-target-size);
  font-weight: 600;
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-primary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
}

.site-footer__mark {
  width: var(--dl-icon-lg);
  height: var(--dl-icon-lg);
  color: var(--dl-accent);
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
  display: inline-flex;
  align-items: center;
  /* 导航链接也是指针目标,元素本体宽高均须达 44px 下限 */
  min-height: var(--dl-target-size);
  min-inline-size: var(--dl-target-size);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  text-decoration: none;
  border-radius: var(--dl-radius-sm);
  transition: color var(--dl-duration-fast) var(--dl-ease-standard);
}

.site-footer__link:hover {
  color: var(--dl-text-primary);
}

.site-footer__bottom {
  margin-top: var(--dl-space-12);
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
