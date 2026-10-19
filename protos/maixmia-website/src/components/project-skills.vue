<script setup lang="ts">
// 项目 Skill 面板:标题与计数由项目内容 tab 承担,这里只渲染列表与四态。
// 与文件树共用同一条左侧节奏:slash 图标落在 8px(树的导引线),命令名落在 28px(文件名列)。
import type { Skill } from '../contracts/generated/skill'
import { skillDescriptionWithSource } from '../data/skills'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  projectName: string
  skills: readonly Skill[]
  status: 'loading' | 'ready' | 'error'
}>()
const emit = defineEmits<{ insert: [skill: Skill]; retry: [] }>()
const { t } = useI18n()

function sourceHint(skill: Skill): string {
  return skill.scope === 'project'
    ? t.value.workspace.skills.projectScopeHint
    : `${skill.sourceName} · ${t.value.workspace.skills.agentPluginScope}`
}
</script>

<template>
  <div class="project-skills" :data-status="status">
    <p v-if="status === 'loading'" class="project-skills__state">{{ t.workspace.skills.loading }}</p>
    <div v-else-if="status === 'error'" class="project-skills__state project-skills__state--error">
      <p>{{ t.workspace.skills.error }}</p>
      <button type="button" class="project-skills__retry" @click="emit('retry')">{{ t.workspace.skills.retry }}</button>
    </div>
    <p v-else-if="skills.length === 0" class="project-skills__state">{{ t.workspace.skills.empty }}</p>
    <ul v-else class="project-skills__list" :aria-label="`${projectName} · ${t.workspace.skills.title}`">
      <li v-for="skill in skills" :key="skill.id" class="project-skills__item">
        <button type="button" class="project-skills__row" :aria-label="t.workspace.skills.insertLabel.replace('{command}', skill.command)" @click="emit('insert', skill)">
          <DliIcon name="slash" size="sm" class="project-skills__slash" />
          <span class="project-skills__command" :title="skill.command">{{ skill.command }}</span>
          <span class="project-skills__source" :title="sourceHint(skill)">{{ skill.scope === 'project' ? t.workspace.skills.sourceProject : t.workspace.skills.sourcePlugin }}</span>
          <span class="project-skills__description" :title="skillDescriptionWithSource(skill)">{{ skillDescriptionWithSource(skill) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 面板本体:不画自己的标题或外框 —— tab 已经承担「这是哪一栏」。 */
.project-skills { display: grid; gap: var(--dl-space-1); min-inline-size: 0; padding-block: var(--dl-space-2); }

.project-skills__list { display: grid; gap: var(--dl-space-1); }

/* Skill 行是纵向密集行:整行 button,桌面 36(--dl-control-height),抽屉 44。
   左内边距 8 = 树的导引线;slash 图标 16 + gap 4 → 命令名落在 28,与文件名同列。 */
.project-skills__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--dl-space-1);
  inline-size: 100%;
  min-block-size: var(--dl-control-height);
  padding-block: var(--dl-space-1);
  padding-inline: var(--workspace-tree-step) var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  text-align: left;
  color: var(--dl-text-primary);
}

/* 命令与描述都**单行省略**:侧栏只有 300px,换行会把列表撑高。
   完整命令与描述留在 title / aria-label 上,信息不丢。行高统一走 snug(密集列表档)。 */
.project-skills__slash { color: var(--dl-text-tertiary); }
.project-skills__command { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.project-skills__source { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); white-space: nowrap; }
.project-skills__description { grid-column: 2 / -1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); }

.project-skills__state { padding-block: var(--dl-space-1); padding-inline: var(--workspace-tree-step) var(--dl-space-2); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); color: var(--dl-text-secondary); }
.project-skills__state--error { display: grid; gap: var(--dl-space-1); color: var(--dl-error); }
.project-skills__retry { justify-self: start; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); }
.project-skills__row:hover, .project-skills__retry:hover { background: var(--dl-bg-hover); }
.project-skills__row:active, .project-skills__retry:active { background: var(--dl-bg-sunken); }
.project-skills button:focus-visible { box-shadow: var(--dl-focus-ring); }
.project-skills button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 1023px) {
  .project-skills__row { min-block-size: var(--dl-target-size); }
}
</style>
