<script setup lang="ts">
// 项目权限草稿:顶层「跟随 Agent / 自定义」是整块语义;
// 自定义态内部仍保留「继承 Agent 模式(仅追加规则)」这一模式值,两层互不替代。
// 模式开关是正文的第一个可交互元素,跟随态只读呈现 Agent 的生效模式与规则计数。
import { computed, onMounted, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentPermissions, PermissionModeId } from '../contracts/generated/agent-permissions'
import type { Project } from '../contracts/generated/project'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'
import { getAgentPermissions, listProjectPermissionGroup, saveProjectPermissionGroup } from '../api/agent-permissions'
import { useI18n } from '../i18n'
import AgentPermissionsEditor from './agent-permissions.vue'
import ProjectFollowSummary from './project-follow-summary.vue'
import type { ProjectPanelState } from './project-settings-state'
import SegmentedControl from './segmented-control.vue'
import type { SegmentedOption } from './segmented-control.vue'

type PermissionMode = 'follow' | 'custom'

const props = defineProps<{ project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ saved: [group: ProjectPermissionGroup]; state: [state: ProjectPanelState] }>()
const { t } = useI18n()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const draft = ref<ProjectPermissionGroup>({ path: props.project.path, followAgent: true, modeOverride: null, rules: [] })
const baselineSerialized = ref('')
const isSaving = ref(false)
const saveError = ref('')
const saveFeedback = ref<'idle' | 'saved' | 'error'>('idle')
const agentPermissions = ref<AgentPermissions | null>(null)
const agentPermissionsStatus = ref<'loading' | 'ready' | 'error'>('loading')
const dialogId = `project-permission-${Math.random().toString(36).slice(2)}`
let loadVersion = 0

const permissionMode = computed<PermissionMode>(() => draft.value.followAgent ? 'follow' : 'custom')
const modeOptions = computed<SegmentedOption[]>(() => [
  { id: 'follow', label: t.value.workspace.projectSettings.followAgent },
  { id: 'custom', label: t.value.workspace.projectSettings.custom },
])
const agentModeLabel = computed(() => {
  if (agentPermissionsStatus.value === 'loading') return ''
  const mode = agentPermissions.value?.defaultMode
  if (mode === undefined || agentPermissionsStatus.value === 'error') return t.value.workspace.projectSettings.agentModeUnavailable
  return permissionModeText(mode)
})
const agentModeLine = computed(() => agentModeLabel.value === ''
  ? ''
  : t.value.workspace.projectSettings.agentModeLine.replace('{mode}', agentModeLabel.value))

function permissionModeText(mode: PermissionModeId): string {
  return t.value.workspace.permissions.modes[mode]
}
const isDirty = computed(() => status.value === 'ready' && JSON.stringify(draft.value) !== baselineSerialized.value)
const saveState = computed(() => isSaving.value ? 'saving' : saveFeedback.value === 'error' ? 'error' : saveFeedback.value === 'saved' && !isDirty.value ? 'saved' : isDirty.value ? 'dirty' : 'clean')
const saveStateLabel = computed(() => {
  const copy = t.value.workspace.projectSettings
  if (saveState.value === 'saving') return copy.saving
  if (saveState.value === 'error') return saveError.value || copy.saveError
  if (saveState.value === 'saved') return copy.saved
  return saveState.value === 'dirty' ? copy.saveDirty : copy.saveClean
})
const panelState = computed<ProjectPanelState>(() => ({
  status: status.value,
  dirty: isDirty.value,
  saving: isSaving.value,
  saveState: saveState.value,
  saveStateLabel: saveStateLabel.value,
  canSave: isDirty.value && status.value === 'ready' && !isSaving.value,
}))
watch(panelState, (state) => emit('state', state), { immediate: true })

// 模式切换是草稿变更;保留 modeOverride / rules 作为「最近一次自定义值」,但不生效。
function onModeChange(id: string): void {
  if (id !== 'follow' && id !== 'custom') return
  const followAgent = id === 'follow'
  if (followAgent === draft.value.followAgent) return
  draft.value = { ...draft.value, followAgent }
}
async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  saveFeedback.value = 'idle'
  saveError.value = ''
  agentPermissionsStatus.value = 'loading'
  const [result, agentResult] = await Promise.all([
    listProjectPermissionGroup(props.project.path),
    getAgentPermissions(props.agent.id),
  ])
  if (agentResult.ok) {
    agentPermissions.value = agentResult.value
    agentPermissionsStatus.value = 'ready'
  } else {
    agentPermissionsStatus.value = 'error'
  }
  if (version !== loadVersion) return
  if (!result.ok) { status.value = 'error'; return }
  draft.value = structuredClone(result.value)
  baselineSerialized.value = JSON.stringify(result.value)
  status.value = 'ready'
}
// 保存成功返回 true;失败返回 false,由窗体把焦点送到底部保存状态。
async function save(): Promise<boolean> {
  if (!isDirty.value || isSaving.value) return false
  isSaving.value = true
  saveError.value = ''
  saveFeedback.value = 'idle'
  const payload: ProjectPermissionGroup = { ...draft.value, rules: draft.value.rules.map((rule) => ({ ...rule })) }
  const result = await saveProjectPermissionGroup(props.project.path, payload)
  isSaving.value = false
  if (!result.ok) {
    saveError.value = result.error.message
    saveFeedback.value = 'error'
    return false
  }
  draft.value = structuredClone(result.value)
  baselineSerialized.value = JSON.stringify(result.value)
  saveFeedback.value = 'saved'
  emit('saved', result.value)
  return true
}
watch(isDirty, (dirty) => { if (dirty) saveFeedback.value = 'idle' })
onMounted(() => { void load() })
defineExpose({ save })
</script>

<template>
  <div class="project-permission">
    <div v-if="status === 'loading'" class="project-config__load-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
    <div v-else-if="status === 'error'" class="project-config__load-state" role="alert"><p>{{ t.workspace.projectSettings.loadError }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button></div>
    <template v-else>
      <!-- 模式开关是正文的第一个可交互元素:说明文字放在它下方。 -->
      <section class="project-permission__mode" :aria-labelledby="`${dialogId}-mode-title`">
        <div class="project-permission__mode-head">
          <h3 :id="`${dialogId}-mode-title`">{{ t.workspace.projectSettings.permissionMode }}</h3>
          <SegmentedControl :model-value="permissionMode" :options="modeOptions" :label="t.workspace.projectSettings.permissionMode" @update:model-value="onModeChange" />
        </div>
        <p class="project-permission__hint">{{ permissionMode === 'follow' ? t.workspace.projectSettings.permissionFollowHint : t.workspace.projectSettings.permissionCustomHint }}</p>
      </section>
      <ProjectFollowSummary v-if="permissionMode === 'follow'" kind="permissions" :agent="agent" />
      <template v-else>
        <p v-if="agentModeLine !== ''" class="project-permission__agent-line" :data-state="agentPermissionsStatus">{{ agentModeLine }}</p>
        <AgentPermissionsEditor
          :id-prefix="`project-permissions-${project.id}`" scope="project" :owner-id="project.path" :owner-name="project.name"
          v-model:default-mode="draft.modeOverride" v-model:rules="draft.rules" :disabled="isSaving" show-mode-hint
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 面板内的断点按内容区实际宽度判定,不复用视口断点:嵌在带左栏的窗体里时
   视口宽度不等于面板宽度。 */
.project-permission { display: grid; gap: var(--dl-space-3); min-width: 0; container-type: inline-size; }
.project-permission__mode { display: grid; gap: var(--dl-space-2); padding-block-end: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-permission__mode-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2) var(--dl-space-3); }
.project-permission__mode h3 { font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-label); }
.project-permission__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-permission__agent-line { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
</style>
