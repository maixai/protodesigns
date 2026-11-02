<script setup lang="ts">
// 项目权限草稿:模式可覆盖,规则只追加;保存由统一设置窗体的底部动作区触发。
// 面板挂载即加载(与另外两个域并行预取),切换 Tab 不卸载、不重置草稿。
import { computed, onMounted, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'
import { listProjectPermissionGroup, saveProjectPermissionGroup } from '../api/agent-permissions'
import { useI18n } from '../i18n'
import AgentPermissionsEditor from './agent-permissions.vue'
import AgentReadonlyContext from './agent-readonly-context.vue'
import type { ProjectPanelState } from './project-settings-state'

const props = defineProps<{ project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ saved: [group: ProjectPermissionGroup]; state: [state: ProjectPanelState] }>()
const { t } = useI18n()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const draft = ref<ProjectPermissionGroup>({ path: props.project.path, modeOverride: null, rules: [] })
const baselineSerialized = ref('')
const isSaving = ref(false)
const saveError = ref('')
const saveFeedback = ref<'idle' | 'saved' | 'error'>('idle')
let loadVersion = 0
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
async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  saveFeedback.value = 'idle'
  saveError.value = ''
  const result = await listProjectPermissionGroup(props.project.path)
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
    <p class="project-config__scope">{{ t.workspace.projectSettings.permissionScopeHint }}</p>
    <AgentReadonlyContext kind="permissions" :agent="agent" />
    <div v-if="status === 'loading'" class="project-config__load-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
    <div v-else-if="status === 'error'" class="project-config__load-state" role="alert"><p>{{ t.workspace.projectSettings.loadError }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button></div>
    <template v-else>
      <AgentPermissionsEditor :id-prefix="`project-permissions-${project.id}`" scope="project" :owner-id="project.path" :owner-name="project.name" v-model:default-mode="draft.modeOverride" v-model:rules="draft.rules" :disabled="isSaving" />
    </template>
  </div>
</template>

<style scoped>
/* 面板内的断点按内容区实际宽度判定,不复用视口断点:嵌在带左栏的窗体里时
   视口宽度不等于面板宽度。 */
.project-permission { display: grid; gap: var(--dl-space-4); min-width: 0; container-type: inline-size; }
</style>
