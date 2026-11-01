<script setup lang="ts">
// 项目权限草稿:模式可覆盖,规则只追加;底部保存前不写入项目仓库。
import { computed, nextTick, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'
import { listProjectPermissionGroup, saveProjectPermissionGroup } from '../api/agent-permissions'
import { useI18n } from '../i18n'
import AgentPermissionsEditor from './agent-permissions.vue'
import AgentReadonlyContext from './agent-readonly-context.vue'
import ProjectConfigShell from './project-config-shell.vue'

const props = defineProps<{ open: boolean; project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ close: []; saved: [group: ProjectPermissionGroup] }>()
const { t } = useI18n()
const rootRef = ref<HTMLElement | null>(null)
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
async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  saveFeedback.value = 'idle'
  saveError.value = ''
  const result = await listProjectPermissionGroup(props.project.path)
  if (version !== loadVersion || !props.open) return
  if (!result.ok) { status.value = 'error'; return }
  draft.value = structuredClone(result.value)
  baselineSerialized.value = JSON.stringify(result.value)
  status.value = 'ready'
}
async function save(): Promise<void> {
  if (!isDirty.value || isSaving.value) return
  isSaving.value = true
  saveError.value = ''
  saveFeedback.value = 'idle'
  const payload: ProjectPermissionGroup = { ...draft.value, rules: draft.value.rules.map((rule) => ({ ...rule })) }
  const result = await saveProjectPermissionGroup(props.project.path, payload)
  if (!props.open) return
  isSaving.value = false
  if (!result.ok) {
    saveError.value = result.error.message
    saveFeedback.value = 'error'
    await nextTick()
    rootRef.value?.querySelector<HTMLElement>('.permissions-error, .project-config__save-state')?.focus()
    return
  }
  draft.value = structuredClone(result.value)
  baselineSerialized.value = JSON.stringify(result.value)
  saveFeedback.value = 'saved'
  emit('saved', result.value)
}
watch(() => props.open, (isOpen) => { if (isOpen) void load(); else loadVersion += 1 }, { immediate: true })
watch(isDirty, (dirty) => { if (dirty) saveFeedback.value = 'idle' })
</script>

<template>
  <ProjectConfigShell :open="open" :project="project" :title="t.workspace.projectSettings.permissionTitle" :scope-hint="t.workspace.projectSettings.permissionScopeHint" :busy="isSaving" @close="emit('close')">
    <div ref="rootRef" class="project-permission">
      <AgentReadonlyContext kind="permissions" :agent="agent" />
      <div v-if="status === 'loading'" class="project-config__load-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
      <div v-else-if="status === 'error'" class="project-config__load-state" role="alert"><p>{{ t.workspace.projectSettings.loadError }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button></div>
      <template v-else>
        <AgentPermissionsEditor :id-prefix="`project-permissions-${project.id}`" scope="project" :owner-id="project.path" :owner-name="project.name" v-model:default-mode="draft.modeOverride" v-model:rules="draft.rules" :disabled="isSaving" />
      </template>
    </div>
    <template #footer="{ close }">
      <p class="project-config__save-state" :data-state="saveState" tabindex="-1">{{ saveStateLabel }}</p>
      <div class="project-config__buttons"><button type="button" class="dl-btn dl-btn--ghost" :disabled="isSaving" @click="close">{{ t.workspace.projectSettings.cancel }}</button><button type="button" class="dl-btn dl-btn--primary" :disabled="!isDirty || status !== 'ready' || isSaving" @click="save">{{ isSaving ? t.workspace.projectSettings.saving : t.workspace.projectSettings.save }}</button></div>
    </template>
  </ProjectConfigShell>
</template>

<style scoped>
.project-permission { display: grid; gap: var(--dl-space-4); min-width: 0; }
</style>
