<script setup lang="ts">
import { session } from '../auth/session'
import { CONSOLE_NAV } from '../data/console'
import { toIconName } from '../data/icons'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import DlIcon from '../components/dl-icon.vue'
import ConsoleOverview from '../components/console-overview.vue'

const { t } = useI18n()
</script>

<template>
  <div class="dl-container console-layout">
    <aside class="console-sidebar">
      <div class="console-sidebar__workspace">
        <p class="console-label">{{ t.console.workspace }}</p>
        <p class="console-sidebar__organization">{{ session.profile?.organization }}</p>
      </div>
      <nav class="console-nav" :aria-label="t.console.navigation">
        <a v-for="item in CONSOLE_NAV" :key="item.id" :href="`#/console${item.id === 'overview' ? '' : `/${item.id}`}`" class="console-nav__item" :aria-current="currentRoute.section === item.id ? 'page' : undefined">
          <DlIcon :name="toIconName(item.icon)" size="sm" />
          {{ t.console.nav[item.id] }}
        </a>
      </nav>
    </aside>
    <main id="main" class="console-content">
      <header class="console-content__header">
        <p class="console-label">{{ session.profile?.organization }}</p>
        <h1>{{ t.console.nav[currentRoute.section] }}</h1>
        <p class="console-content__description">{{ t.console.descriptions[currentRoute.section] }}</p>
      </header>
      <ConsoleOverview v-if="currentRoute.section === 'overview'" />
      <section v-else class="console-placeholder" :aria-label="t.console.preview">
        <DlIcon :name="toIconName(CONSOLE_NAV.find((item) => item.id === currentRoute.section)?.icon ?? 'grid')" size="lg" />
        <h2>{{ t.console.nav[currentRoute.section] }}</h2>
        <p>{{ t.console.later }}</p>
      </section>
      <p class="console-content__sample">{{ t.console.sample }}</p>
    </main>
  </div>
</template>

<style scoped>
.console-layout {
  display: grid; grid-template-columns: calc(var(--dl-space-12) * 4) minmax(0, 1fr);
  gap: var(--dl-space-8); min-height: calc(100dvh - var(--dl-header-height));
}
.console-sidebar { padding-block: var(--dl-space-8); border-inline-end: var(--dl-border-width) solid var(--dl-border-base); }
.console-sidebar__workspace { padding-inline-end: var(--dl-space-4); margin-block-end: var(--dl-space-6); }
.console-label { font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); }
.console-sidebar__organization { font-weight: 500; margin-block-start: var(--dl-space-1); }
.console-nav { display: flex; flex-direction: column; gap: var(--dl-space-1); padding-inline-end: var(--dl-space-4); }
.console-nav__item {
  display: flex; align-items: center; gap: var(--dl-space-3);
  min-width: var(--dl-target-size); min-height: var(--dl-target-size);
  padding: var(--dl-space-2) var(--dl-space-3);
  border-inline-start: calc(var(--dl-border-width) * 3) solid transparent;
  border-radius: var(--dl-radius-sm); text-decoration: none; color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm); white-space: nowrap;
}
.console-nav__item:hover { background-color: var(--dl-bg-hover); }
.console-nav__item:active { background-color: var(--dl-bg-active); }
.console-nav__item:focus-visible { box-shadow: var(--dl-focus-ring); }
.console-nav__item[aria-current='page'] { border-inline-start-color: var(--dl-accent); font-weight: 500; background-color: var(--dl-accent-soft); color: var(--dl-accent); }
.console-nav__item[aria-current='page']:hover { background-color: var(--dl-bg-hover); }
.console-nav__item[aria-current='page']:active { background-color: var(--dl-bg-active); }
.console-content { min-width: 0; padding-block: var(--dl-space-8); }
.console-content__header { margin-block-end: var(--dl-space-6); }
.console-content h1 { margin-block: var(--dl-space-1) var(--dl-space-2); font-size: var(--dl-font-size-2xl); font-weight: 600; line-height: var(--dl-line-body); }
.console-content__description { color: var(--dl-text-secondary); max-width: var(--dl-measure); }
.console-content__sample { margin-block-start: var(--dl-space-6); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.console-placeholder { padding: var(--dl-space-8); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background-color: var(--dl-bg-elevated); }
.console-placeholder > .dl-icon { color: var(--dl-accent); }
.console-placeholder h2 { margin-block: var(--dl-space-4) var(--dl-space-2); font-size: var(--dl-font-size-lg); font-weight: 500; }
.console-placeholder p { color: var(--dl-text-secondary); max-width: var(--dl-measure); }
@media (max-width: 767px) {
  /* 空态/占位页也保持横向导航紧凑,不把视口剩余高度分配给导航行。 */
  .console-layout { grid-template-columns: minmax(0, 1fr); gap: 0; align-content: start; }
  .console-sidebar { min-width: 0; padding-block: var(--dl-space-3); border-inline-end: none; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
  .console-sidebar__workspace { display: none; }
  .console-nav { flex-direction: row; overflow-x: auto; padding: var(--dl-space-1); }
  .console-nav__item { flex: none; }
  .console-content { padding-block: var(--dl-space-6); }
}
</style>
