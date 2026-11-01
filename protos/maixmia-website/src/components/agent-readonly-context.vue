<script setup lang="ts">
// 项目窗体顶部的 Agent 只读上下文。默认折叠但摘要自足;加载失败只影响本区块。
import { computed, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentPermissions, PermissionRuleKindId } from '../contracts/generated/agent-permissions'
import type { ModelSubscription } from '../contracts/generated/agent-model-config'
import type { McpServer } from '../contracts/generated/mcp-server'
import { getAgentPermissions } from '../api/agent-permissions'
import { listAgentMcpServers } from '../api/agent-mcp'
import { MODELS, SUBSCRIPTION_PROVIDER_LABELS } from '../data/models'
import { resolveProjectModelSource } from '../data/project-model-settings'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  kind: 'model' | 'permissions' | 'mcp'
  agent: AgentSummary
  projectServers?: readonly McpServer[]
}>()
const { t } = useI18n()
const isExpanded = ref(false)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const permissions = ref<AgentPermissions | null>(null)
const agentServers = ref<McpServer[]>([])
let loadVersion = 0
const RULE_ORDER: readonly PermissionRuleKindId[] = ['deny', 'ask', 'allow']

const sourceResolution = computed(() => resolveProjectModelSource({ followAgent: true }, props.agent.model))
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
  return source.gateways.find((item) => item.id === source.activeSourceId)?.name ?? source.activeSourceId
})
const sourceStatus = computed(() => sourceResolution.value.issue === null
  ? t.value.workspace.projectSettings.agentContext.sourceReady
  : t.value.workspace.projectSettings.agentContext.sourceUnavailable)
const needsAttention = computed(() => agentServers.value.filter((server) => server.status === 'needsAuth' || server.status === 'failed').length)
const shadowedCount = computed(() => {
  if (props.kind !== 'mcp' || status.value !== 'ready') return 0
  const names = new Set((props.projectServers ?? []).map((server) => server.name))
  return agentServers.value.filter((server) => names.has(server.name)).length
})
const permissionCounts = computed(() => {
  const counts: Record<PermissionRuleKindId, number> = { deny: 0, ask: 0, allow: 0 }
  for (const rule of permissions.value?.rules ?? []) counts[rule.kind] += 1
  return counts
})

function displayModelName(id: string): string {
  const model = MODELS.find((item) => item.id === id)
  return model === undefined ? id : t.value.workspace.models[model.nameKey]
}
function effortLabel(value: string): string {
  return value || t.value.workspace.projectSettings.effortModelDefaultValue
}
function compactLabel(value: number): string {
  return value === 0 ? t.value.workspace.projectSettings.autoCompactModel : `${Math.round(value / 1000)}K`
}
function thinkingLabel(value: number): string {
  return value === 0 ? t.value.workspace.projectSettings.agentContext.thinkingAuto : `${Math.round(value / 1024)}K`
}
function fallbackLabel(): string {
  return props.agent.model.fallbackModelIds.length === 0
    ? t.value.workspace.projectSettings.fallbackNone
    : props.agent.model.fallbackModelIds.map(displayModelName).join(' → ')
}
async function load(): Promise<void> {
  if (props.kind === 'model') { status.value = 'ready'; return }
  const version = ++loadVersion
  status.value = 'loading'
  loadError.value = ''
  const result = props.kind === 'permissions' ? await getAgentPermissions(props.agent.id) : await listAgentMcpServers(props.agent.id)
  if (version !== loadVersion) return
  if (!result.ok) { status.value = 'error'; loadError.value = result.error.message; return }
  if (props.kind === 'permissions') {
    // 两个 API 的返回形状不同,按当前领域接收对应值。
    if ('agentId' in result.value) permissions.value = result.value
  } else if (Array.isArray(result.value)) agentServers.value = result.value
  status.value = 'ready'
}
watch(() => [props.kind, props.agent.id], () => {
  isExpanded.value = false
  permissions.value = null
  agentServers.value = []
  void load()
}, { immediate: true })
</script>

<template>
  <section class="agent-context" :data-kind="kind" :data-state="status">
    <button type="button" class="agent-context__disclosure" :aria-expanded="isExpanded" :aria-controls="`${kind}-agent-context-${agent.id}`" @click="isExpanded = !isExpanded">
      <DliIcon name="chevronRight" size="sm" :class="{ 'is-expanded': isExpanded }" />
      <span>{{ t.workspace.projectSettings.agentContext.title.replace('{name}', agent.name) }}</span>
    </button>
    <p class="agent-context__managed">{{ t.workspace.projectSettings.managedByAgent }}</p>

    <template v-if="kind === 'model'">
      <dl class="agent-context__facts">
        <div><dt>{{ t.workspace.projectSettings.source }}</dt><dd>{{ sourceName || t.workspace.projectSettings.sourceNone }} · {{ sourceStatus }}</dd></div>
        <div><dt>{{ t.workspace.projectSettings.modelDefault }}</dt><dd><code>{{ displayModelName(agent.model.defaultModelId) }}</code></dd></div>
        <div><dt>{{ t.workspace.projectSettings.effort }}</dt><dd><code>{{ effortLabel(agent.model.defaultEffortLevel) }}</code></dd></div>
        <div><dt>{{ t.workspace.projectSettings.fallback }}</dt><dd>{{ fallbackLabel() }}</dd></div>
        <div><dt>{{ t.workspace.projectSettings.autoCompact }}</dt><dd><code>{{ compactLabel(agent.model.autoCompactWindowTokens) }}</code></dd></div>
        <div><dt>{{ t.workspace.projectSettings.agentContext.thinking }}</dt><dd><code>{{ thinkingLabel(agent.model.maxThinkingTokens) }}</code></dd></div>
      </dl>
    </template>

    <div v-else-if="status === 'loading'" class="agent-context__state" role="status">{{ t.workspace.projectSettings.agentContext.loading }}</div>
    <div v-else-if="status === 'error'" class="agent-context__state" role="alert">
      <p>{{ loadError }}</p>
      <p v-if="kind === 'mcp'">{{ t.workspace.projectSettings.agentContext.sameNameUnavailable }}</p>
      <button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button>
    </div>

    <template v-else-if="kind === 'permissions' && permissions">
      <dl class="agent-context__facts">
        <div><dt>{{ t.workspace.permissions.defaultMode }}</dt><dd>{{ t.workspace.permissions.modes[permissions.defaultMode] }}</dd></div>
        <div><dt>{{ t.workspace.projectSettings.agentContext.ruleCounts }}</dt><dd>deny {{ permissionCounts.deny }} · ask {{ permissionCounts.ask }} · allow {{ permissionCounts.allow }}</dd></div>
      </dl>
    </template>

    <template v-else-if="kind === 'mcp'">
      <dl class="agent-context__facts">
        <div><dt>{{ t.workspace.projectSettings.agentContext.serverCount }}</dt><dd>{{ agentServers.length }}</dd></div>
        <div><dt>{{ t.workspace.projectSettings.agentContext.attentionCount }}</dt><dd>{{ needsAttention }}</dd></div>
        <div><dt>{{ t.workspace.projectSettings.agentContext.shadowedCount }}</dt><dd>{{ shadowedCount }}</dd></div>
      </dl>
    </template>

    <div :id="`${kind}-agent-context-${agent.id}`" v-show="isExpanded" class="agent-context__details">
      <p v-if="kind === 'model'" class="agent-context__detail"><code>{{ agent.model.source.activeSourceId || t.workspace.projectSettings.sourceNone }}</code></p>
      <div v-else-if="kind === 'permissions' && permissions && status === 'ready'" class="agent-context__rules">
        <section v-for="ruleKind in RULE_ORDER" :key="ruleKind">
          <h4>{{ t.workspace.permissions.kinds[ruleKind] }} <code>{{ ruleKind }}</code></h4>
          <ul><li v-for="rule in permissions.rules.filter((item) => item.kind === ruleKind)" :key="rule.id"><code>{{ rule.pattern }}</code></li></ul>
        </section>
      </div>
      <div v-else-if="kind === 'mcp' && status === 'ready'" class="agent-context__servers">
        <div v-for="server in agentServers" :key="server.id" class="agent-context__server">
          <strong>{{ server.displayName }}</strong><code>{{ server.name }}</code><code>{{ server.transport }}</code>
          <span>{{ t.workspace.mcp.status[server.status] }}</span>
          <span v-if="server.status === 'connected'">{{ t.workspace.mcp.tools.replace('{count}', String(server.tools.length)) }}</span>
          <span v-if="shadowedCount > 0 && (projectServers ?? []).some((item) => item.name === server.name)" class="agent-context__shadowed">{{ t.workspace.mcp.sameName }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-context { display: grid; gap: var(--dl-space-2); min-width: 0; padding-block-end: var(--dl-space-4); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.agent-context__disclosure { display: flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); padding: 0; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; text-align: left; }
.agent-context__disclosure :deep(svg) { transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.agent-context__disclosure :deep(.is-expanded) { transform: rotate(90deg); }
.agent-context__managed, .agent-context__detail { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.agent-context__facts { display: grid; margin: 0; border-block: var(--dl-border-width) solid var(--dl-border-subtle); }
.agent-context__facts > div { display: grid; grid-template-columns: minmax(calc(var(--dl-space-12) * 3), 0.45fr) minmax(0, 1fr); gap: var(--dl-space-3); padding-block: var(--dl-space-2); }
.agent-context__facts > div + div { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.agent-context__facts dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.agent-context__facts dd { min-width: 0; margin: 0; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; }
.agent-context__facts code, .agent-context__rules code, .agent-context__server code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.agent-context__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.agent-context__state[role='alert'] { color: var(--dl-error); }
.agent-context__rules, .agent-context__servers { display: grid; gap: var(--dl-space-3); padding-block-start: var(--dl-space-2); }
.agent-context__rules section { display: grid; gap: var(--dl-space-1); }
.agent-context__rules h4 { font-size: var(--dl-font-size-xs); font-weight: 500; }
.agent-context__rules ul { display: grid; gap: var(--dl-space-1); }
.agent-context__server { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-3); padding-block: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); font-size: var(--dl-font-size-xs); }
.agent-context__server strong { font-weight: 500; }
.agent-context__shadowed { color: var(--dl-warning); }
.agent-context button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.agent-context button:hover { background: var(--dl-bg-hover); }
@media (max-width: 560px) { .agent-context__facts > div { grid-template-columns: minmax(0, 1fr); gap: var(--dl-space-1); } }
</style>
