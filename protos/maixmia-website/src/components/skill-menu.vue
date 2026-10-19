<script setup lang="ts">
// 焦点留在 textbox,高亮与滚动只跟随 activeIndex,不抢输入焦点。
import { nextTick, ref, watch } from 'vue'
import type { Skill } from '../contracts/generated/skill'
import { skillDescriptionWithSource, skillOptionId } from '../data/skills'
import { useI18n } from '../i18n'

const props = defineProps<{
  listId: string
  projectName: string
  skills: readonly Skill[]
  totalCount: number
  query: string
  status: 'loading' | 'ready' | 'error'
  activeIndex: number
}>()
const emit = defineEmits<{ select: [skill: Skill]; activate: [index: number]; retry: [] }>()
const { t } = useI18n()
const listRef = ref<HTMLElement | null>(null)

function sourceHint(skill: Skill): string {
  return skill.scope === 'project'
    ? t.value.workspace.skills.projectScopeHint
    : `${skill.sourceName} · ${t.value.workspace.skills.agentPluginScope}`
}

watch([() => props.activeIndex, () => props.skills], async () => {
  await nextTick()
  listRef.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}, { immediate: true })
</script>

<template>
  <section class="skill-menu" :aria-label="t.workspace.skills.menuLabel" :data-status="status">
    <header class="skill-menu__head">
      <span class="skill-menu__title">{{ t.workspace.skills.title }}</span>
      <span class="skill-menu__project">{{ projectName }}</span>
      <span class="skill-menu__count">{{ status === 'ready' ? (query.trim() === '' ? totalCount : `${skills.length}/${totalCount}`) : '—' }}</span>
    </header>
    <p v-if="status === 'loading'" class="skill-menu__state">{{ t.workspace.skills.loadingMenu }}</p>
    <div v-else-if="status === 'error'" class="skill-menu__state skill-menu__state--error">
      <p>{{ t.workspace.skills.errorMenu }}</p>
      <button type="button" class="skill-menu__retry" @mousedown.prevent @click="emit('retry')">{{ t.workspace.skills.retry }}</button>
    </div>
    <p v-else-if="skills.length === 0" class="skill-menu__state">{{ totalCount === 0 ? t.workspace.skills.empty : t.workspace.skills.noMatch }}</p>
    <!-- 即使无结果也保留 listbox,aria-controls 始终指向存在的元素。 -->
    <div :id="listId" ref="listRef" class="skill-menu__list" role="listbox" :aria-label="t.workspace.skills.menuLabel" :aria-busy="status === 'loading'">
      <template v-if="status === 'ready'">
        <button
          v-for="(skill, index) in skills" :id="skillOptionId(listId, index)" :key="skill.id"
          type="button" role="option" class="skill-menu__option" tabindex="-1" :aria-selected="index === activeIndex"
          @mousedown.prevent @mouseenter="emit('activate', index)" @click="emit('select', skill)"
        >
          <span class="skill-menu__command" :title="`/${skill.command}`">/{{ skill.command }}</span>
          <span class="skill-menu__source" :title="sourceHint(skill)">{{ skill.scope === 'project' ? t.workspace.skills.sourceProject : t.workspace.skills.sourcePlugin }}</span>
          <span class="skill-menu__return" aria-hidden="true">{{ index === activeIndex ? '↵' : '' }}</span>
          <span class="skill-menu__description" :title="skillDescriptionWithSource(skill)">{{ skillDescriptionWithSource(skill) }}</span>
        </button>
      </template>
    </div>
    <footer v-if="status === 'ready' && skills.length > 0" class="skill-menu__hint">{{ t.workspace.skills.hint }}</footer>
  </section>
</template>

<style scoped>
.skill-menu { position: absolute; inset-block-end: calc(100% + var(--dl-space-2)); inset-inline: 0; z-index: var(--dl-z-overlay); display: flex; flex-direction: column; max-block-size: min(calc(10 * var(--dl-control-height)), 46vh); min-inline-size: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); color: var(--dl-text-primary); text-align: left; }
.skill-menu__head { display: flex; align-items: baseline; gap: var(--dl-space-2); flex: none; padding: var(--dl-space-2) var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-base); font-size: var(--dl-font-size-xs); }
.skill-menu__title { font-weight: 500; }
.skill-menu__project { min-inline-size: 0; overflow-wrap: anywhere; font-family: var(--dl-font-mono); color: var(--dl-text-secondary); }
.skill-menu__count { margin-inline-start: auto; font-family: var(--dl-font-mono); color: var(--dl-text-tertiary); }
.skill-menu__list { min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); }
.skill-menu__option { display: grid; grid-template-columns: minmax(0, 1fr) auto var(--dl-icon-sm); align-items: center; gap: var(--dl-space-1) var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-primary); text-align: left; }
.skill-menu__option[aria-selected='true'] { background: var(--dl-accent-soft); box-shadow: inset var(--dl-border-width) 0 0 var(--dl-accent); }
.skill-menu__option:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); }
.skill-menu__option:active { background: var(--dl-bg-sunken); }
/* 命令与描述单行省略:菜单优先保证扫读密度,完整文本留在 title 上。 */
.skill-menu__command { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--dl-font-mono); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-snug); }
.skill-menu__source { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.skill-menu__return { color: var(--dl-accent); font-family: var(--dl-font-mono); }
.skill-menu__description { grid-column: 1 / -1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.skill-menu__hint { flex: none; padding: var(--dl-space-2) var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.skill-menu__state { flex: none; padding: var(--dl-space-3); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.skill-menu__state--error { color: var(--dl-error); }
.skill-menu__retry { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); }
.skill-menu__retry:hover { background: var(--dl-bg-hover); }
.skill-menu__retry:active { background: var(--dl-bg-sunken); }
.skill-menu button:focus-visible { box-shadow: var(--dl-focus-ring); }
.skill-menu button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
</style>
