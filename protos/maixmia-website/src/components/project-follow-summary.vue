<script setup lang="ts">
// 项目跟随态的生效摘要:只读呈现 Agent 当前实际生效的模型 / 权限值。
// 它不是可编辑控件的折叠态 —— 跟随态不渲染任何编辑控件,因此这里也不出现禁用控件。
import { computed, onMounted, ref } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentPermissions, PermissionRuleKindId } from '../contracts/generated/agent-permissions'
import type { ModelSubscription } from '../contracts/generated/agent-model-config'
import { getAgentPermissions } from '../api/agent-permissions'
import { MODELS, SUBSCRIPTION_PROVIDER_LABELS } from '../data/models'
import { resolveProjectModelSource } from '../data/project-model-settings'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ kind: 'model' | 'permissions'; agent: AgentSummary }>()
const { t } = useI18n()
const permissions = ref<AgentPermissions | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const isExpanded = ref(false)
const panelId = `project-follow-summary-${Math.random().toString(36).slice(2)}`

const RULE_ORDER: readonly PermissionRuleKindId[] = ['deny', 'ask', 'allow']

function subscriptionLabel(subscription: ModelSubscription): string {
  const copy = t.value.workspace.agentAdmin
  if (subscription.label === '工作') return copy.subscriptionWork
  if (subscription.label === '个人') return copy.subscriptionPersonal
  if (subscription.label === '旧账户') return copy.subscriptionLegacy
  const numbered = /^账户 (\d+)$/.exec(subscription.label)
  return numbered === null ? subscription.label : copy.subscriptionAccountNumber.replace('{number}', numbered[1] ?? '')
}
const sourceName = computed(() => {
  const source = props.agent.model.source
  const subscription = source.subscriptions.find((item) => `subscription:${item.id}` === source.activeSourceId)
  if (subscription !== undefined) return `${SUBSCRIPTION_PROVIDER_LABELS[subscription.provider]} · ${subscriptionLabel(subscription)}`
  return source.gateways.find((item) => item.id === source.activeSourceId)?.name ?? (source.activeSourceId || t.value.workspace.projectSettings.sourceNone)
})
const sourceStatus = computed(() => resolveProjectModelSource({ followAgent: true }, props.agent.model).issue === null
  ? t.value.workspace.projectSettings.agentContext.sourceReady
  : t.value.workspace.projectSettings.agentContext.sourceUnavailable)

function displayModelName(id: string): string {
  const model = MODELS.find((item) => item.id === id)
  return model === undefined ? id : t.value.workspace.models[model.nameKey]
}
const modelName = computed(() => displayModelName(props.agent.model.defaultModelId))
const effortLabel = computed(() => props.agent.model.defaultEffortLevel || t.value.workspace.projectSettings.effortModelDefaultValue)
const fallbackLabel = computed(() => props.agent.model.fallbackModelIds.length === 0
  ? t.value.workspace.projectSettings.fallbackNone
  : props.agent.model.fallbackModelIds.map(displayModelName).join(' → '))

const permissionCounts = computed(() => {
  const counts: Record<PermissionRuleKindId, number> = { deny: 0, ask: 0, allow: 0 }
  for (const rule of permissions.value?.rules ?? []) counts[rule.kind] += 1
  return counts
})
const permissionModeLabel = computed(() => permissionModeText(permissions.value?.defaultMode ?? ''))

function permissionModeText(mode: string): string {
  const modes = t.value.workspace.permissions.modes
  switch (mode) {
    case 'default': return modes.default
    case 'dontAsk': return modes.dontAsk
    case 'auto': return modes.auto
    case 'bypassPermissions': return modes.bypassPermissions
    default: return mode
  }
}
function rulesFor(kind: PermissionRuleKindId): string[] {
  return (permissions.value?.rules ?? []).filter((rule) => rule.kind === kind).map((rule) => rule.pattern)
}

async function load(): Promise<void> {
  if (props.kind !== 'permissions') {
    status.value = 'ready'
    return
  }
  status.value = 'loading'
  loadError.value = ''
  const result = await getAgentPermissions(props.agent.id)
  if (!result.ok) {
    status.value = 'error'
    loadError.value = result.error.message
    return
  }
  permissions.value = result.value
  status.value = 'ready'
}
onMounted(() => { void load() })
</script>

<template>
  <section class="follow-summary" :data-kind="kind" :data-state="kind === 'permissions' ? status : 'ready'">
    <header class="follow-summary__head">
      <h3>{{ t.workspace.projectSettings.effectiveAgentConfig }}</h3>
      <span class="follow-summary__badge">{{ t.workspace.projectSettings.managedByAgent }}</span>
    </header>

    <dl v-if="kind === 'model'" class="follow-summary__facts">
      <div><dt>{{ t.workspace.projectSettings.source }}</dt><dd>{{ sourceName }} · {{ sourceStatus }}</dd></div>
      <div><dt>{{ t.workspace.projectSettings.modelDefault }}</dt><dd><code>{{ modelName }}</code></dd></div>
      <div><dt>{{ t.workspace.projectSettings.effort }}</dt><dd><code>{{ effortLabel }}</code></dd></div>
      <div><dt>{{ t.workspace.projectSettings.fallback }}</dt><dd>{{ fallbackLabel }}</dd></div>
    </dl>

    <div v-else-if="status === 'loading'" class="follow-summary__state" role="status">{{ t.workspace.projectSettings.agentContext.loading }}</div>
    <div v-else-if="status === 'error'" class="follow-summary__state" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button>
    </div>
    <template v-else>
      <dl class="follow-summary__facts">
        <div><dt>{{ t.workspace.permissions.defaultMode }}</dt><dd>{{ permissionModeLabel }}</dd></div>
        <div>
          <dt>{{ t.workspace.projectSettings.agentContext.ruleCounts }}</dt>
          <dd>{{ t.workspace.permissions.kinds.allow }} {{ permissionCounts.allow }} · {{ t.workspace.permissions.kinds.deny }} {{ permissionCounts.deny }} · {{ t.workspace.permissions.kinds.ask }} {{ permissionCounts.ask }}</dd>
        </div>
      </dl>
      <button type="button" class="follow-summary__disclosure" :aria-expanded="isExpanded" :aria-controls="panelId" @click="isExpanded = !isExpanded">
        <DliIcon name="chevronRight" size="sm" :class="{ 'is-expanded': isExpanded }" />
        <span>{{ t.workspace.projectSettings.followRulesDisclosure }}</span>
      </button>
      <div v-show="isExpanded" :id="panelId" class="follow-summary__rules">
        <p v-if="(permissions?.rules.length ?? 0) === 0" class="follow-summary__empty">{{ t.workspace.permissions.emptyAgent }}</p>
        <section v-for="kind in RULE_ORDER" v-else :key="kind">
          <h4>{{ t.workspace.permissions.kinds[kind] }} · {{ rulesFor(kind).length }}</h4>
          <ul v-if="rulesFor(kind).length > 0"><li v-for="pattern in rulesFor(kind)" :key="pattern"><code>{{ pattern }}</code></li></ul>
          <p v-else class="follow-summary__empty">{{ t.workspace.permissions.emptyKind }}</p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.follow-summary { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.follow-summary__head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--dl-space-1) var(--dl-space-3); }
.follow-summary__head h3 { font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-label); }
.follow-summary__badge { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.follow-summary__facts { display: grid; margin: 0; border-block: var(--dl-border-width) solid var(--dl-border-subtle); }
.follow-summary__facts > div { display: grid; grid-template-columns: minmax(calc(var(--dl-space-12) * 3), 0.35fr) minmax(0, 1fr); gap: var(--dl-space-3); padding-block: var(--dl-space-2); }
.follow-summary__facts > div + div { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.follow-summary__facts dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.follow-summary__facts dd { min-inline-size: 0; margin: 0; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; }
.follow-summary__facts code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.follow-summary__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.follow-summary__state[role='alert'] { color: var(--dl-error); }
.follow-summary__disclosure { display: inline-flex; align-self: start; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-1); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); text-align: left; }
.follow-summary__disclosure:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.follow-summary__disclosure:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.follow-summary__disclosure :deep(svg) { transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.follow-summary__disclosure :deep(.is-expanded) { transform: rotate(90deg); }
.follow-summary__rules { display: grid; gap: var(--dl-space-3); padding-block-start: var(--dl-space-2); }
.follow-summary__rules section { display: grid; gap: var(--dl-space-1); }
.follow-summary__rules h4 { font-size: var(--dl-font-size-xs); font-weight: 500; }
.follow-summary__rules ul { display: grid; gap: var(--dl-space-1); }
.follow-summary__rules code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.follow-summary__empty { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
@media (max-width: 560px) { .follow-summary__facts > div { grid-template-columns: minmax(0, 1fr); gap: var(--dl-space-1); } }
</style>
