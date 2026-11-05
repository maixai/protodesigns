<script setup lang="ts">
// 添加和编辑共用表示层;仅 config 是可提交配置,其余为可恢复的输入缓冲。
import { computed, nextTick, ref, watch } from 'vue'
import { NInput, NSwitch } from 'naive-ui'
import type { McpServer, McpTransportId } from '../contracts/generated/mcp-server'
import type { McpConfig, McpServerInput } from '../contracts/generated/mcp-server-input'
import type { McpFormDraft } from '../contracts/generated/mcp-form-draft'
import { configFromMcpForm, mcpFormDraft, parseMcpJson, validateMcpConfig, validateMcpInput } from '../data/mcp-config'
import { useCodeEditor } from '../composables/use-code-editor'
import { useI18n } from '../i18n'

const props = defineProps<{ server: McpServer | undefined; existing: McpServer[]; prefix: string; busy: boolean }>()
const emit = defineEmits<{ submit: [input: McpServerInput]; dirty: [value: boolean]; cancel: []; announce: [message: string] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const name = ref(props.server?.name ?? '')
const displayName = ref(props.server?.displayName ?? '')
const clientSecret = ref('')
const config = ref<McpConfig>(props.server?.config ?? { type: 'stdio', command: '' })
const form = ref<McpFormDraft>(mcpFormDraft(config.value))
const drafts = ref<Partial<Record<McpTransportId, McpFormDraft>>>({})
const mode = ref<'form' | 'json'>('form')
const raw = ref(JSON.stringify(config.value, null, 2))
const jsonHost = ref<HTMLElement | null>(null)
const wasTouched = ref(false)
let isHydrating = false
const switchError = ref('')
const initial = JSON.stringify({ name: name.value, displayName: displayName.value, form: form.value, raw: raw.value })
const formResult = computed(() => configFromMcpForm(form.value))
const jsonResult = computed(() => parseMcpJson(raw.value, name.value, displayName.value))
const configError = computed(() => {
  const result = mode.value === 'json' ? jsonResult.value : formResult.value
  return result.ok ? '' : result.error.message
})
const input = computed<McpServerInput>(() => ({ name: name.value, displayName: displayName.value, config: config.value,
  ...((config.value.type === 'http' || config.value.type === 'sse') && clientSecret.value !== '' ? { clientSecret: clientSecret.value } : {}),
}))
const validation = computed(() => configError.value || validateMcpInput(input.value, props.existing, props.server?.name)?.message || '')
const isDirty = computed(() => clientSecret.value !== '' || Object.keys(drafts.value).length > 0 || initial !== JSON.stringify({ name: name.value, displayName: displayName.value, form: form.value, raw: raw.value }))
const errorText = computed(() => switchError.value || (wasTouched.value || mode.value === 'json' ? validation.value : ''))
const remote = computed(() => (mode.value === 'json' ? config.value.type : form.value.transport) !== 'stdio' && (mode.value !== 'json' || config.value.type !== undefined))
watch(isDirty, (value) => emit('dirty', value), { immediate: true })
watch(form, () => {
  if (mode.value !== 'form' || isHydrating) return
  wasTouched.value = true
  switchError.value = ''
  const result = configFromMcpForm(form.value, true)
  if (result.ok) config.value = result.value
}, { deep: true, flush: 'sync' })
watch([raw, name], () => {
  if (mode.value !== 'json') return
  switchError.value = ''
  const result = jsonResult.value
  if (!result.ok) return
  const previousTransport = config.value.type ?? 'stdio'
  if (previousTransport !== (result.value.config.type ?? 'stdio')) {
    drafts.value[previousTransport] = previousTransport === form.value.transport ? { ...form.value } : mcpFormDraft(config.value)
  }
  config.value = result.value.config
  if (name.value === '') name.value = result.value.name
})
const editor = useCodeEditor({ host: jsonHost, getText: () => raw.value, getLanguage: () => 'json', getPath: () => 'mcp-server.json', getWrap: () => true,
  onChange: (value) => { if (!props.busy) raw.value = value },
})
// 组合式只在挂载时读取文本;v-if 切换挂载点确保每次显示最新文本,不修改共享编辑器语义。
watch(jsonHost, (host) => {
  const content = host?.querySelector('.cm-content')
  content?.setAttribute('aria-label', t.value.workspace.mcp.configuration + ' JSON')
  content?.setAttribute('aria-describedby', `${props.prefix}-json-hint`)
}, { flush: 'post' })
async function focusError(): Promise<void> { await nextTick(); root.value?.querySelector<HTMLElement>('.mcp-editor-error')?.focus() }
async function switchMode(next: typeof mode.value): Promise<void> {
  if (props.busy || next === mode.value) return
  const representation = mode.value === 'form' ? configFromMcpForm(form.value, true) : jsonResult.value
  if (!representation.ok) {
    switchError.value = representation.error.message
    emit('announce', switchError.value)
    await focusError()
    return
  }
  if (next === 'json') raw.value = JSON.stringify(config.value, null, 2)
  else {
    // 先退出 JSON 模式,再同步表单;公开字段之外的密钥缓冲完全独立。
    mode.value = 'form'
    isHydrating = true
    form.value = mcpFormDraft(config.value)
    isHydrating = false
  }
  mode.value = next
  switchError.value = ''
  await nextTick()
  if (next === 'json') editor.focus()
  else root.value?.querySelector<HTMLElement>('.mcp-config-fields select')?.focus()
}
function switchTransport(event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return
  const next = event.target.value
  if (next !== 'stdio' && next !== 'http' && next !== 'sse') return
  drafts.value[form.value.transport] = { ...form.value }
  form.value = drafts.value[next] ?? mcpFormDraft(next === 'stdio' ? { type: 'stdio', command: '' } : { type: next, url: '' })
}
async function submit(): Promise<void> {
  if (props.busy) return
  wasTouched.value = true
  if (validation.value) { emit('announce', validation.value); await focusError(); return }
  if (props.server !== undefined && !isDirty.value) return
  const validated = validateMcpConfig(config.value)
  if (validated.ok) emit('submit', { ...input.value, config: validated.value })
}
</script>

<template>
  <form ref="root" class="mcp-server-editor" @submit.prevent="submit">
    <div class="mcp-editor-field">
      <label :for="`${prefix}-name`">{{ t.workspace.mcp.name }}</label>
      <NInput v-model:value="name" :readonly="server !== undefined" :disabled="busy" :input-props="{ id: `${prefix}-name`, spellcheck: false, autocomplete: 'off' }" :placeholder="t.workspace.mcp.namePlaceholder" />
      <p class="mcp-editor-hint">{{ server ? t.workspace.mcp.nameReadonly : t.workspace.mcp.nameHint }}</p>
    </div>
    <div class="mcp-editor-field"><label :for="`${prefix}-display-name`">{{ t.workspace.mcp.displayName }}</label><NInput v-model:value="displayName" :disabled="busy" :input-props="{ id: `${prefix}-display-name` }" :placeholder="t.workspace.mcp.displayNamePlaceholder" /></div>
    <section class="mcp-config-section" :aria-label="t.workspace.mcp.configuration">
      <div class="mcp-representation" role="group" :aria-label="t.workspace.mcp.configuration">
        <button type="button" :disabled="busy" :aria-pressed="mode === 'form'" @click="switchMode('form')">{{ t.workspace.mcp.form }}</button>
        <button type="button" :disabled="busy" :aria-pressed="mode === 'json'" @click="switchMode('json')">{{ t.workspace.mcp.json }}</button>
      </div>
      <p v-if="errorText" class="mcp-editor-error" tabindex="-1">{{ errorText }}</p>
      <div v-if="mode === 'form'" class="mcp-config-fields">
        <div class="mcp-editor-field"><label :for="`${prefix}-transport`">{{ t.workspace.mcp.transportLabel }}</label><select :id="`${prefix}-transport`" :value="form.transport" :disabled="busy" @change="switchTransport"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select></div>
        <p v-if="form.transport === 'sse'" class="mcp-editor-hint">{{ t.workspace.mcp.sseDeprecated }}</p>
        <template v-if="form.transport === 'stdio'">
          <div class="mcp-editor-field"><label :for="`${prefix}-command`">{{ t.workspace.mcp.command }}</label><NInput v-model:value="form.command" :disabled="busy" placeholder="npx" :input-props="{ id: `${prefix}-command`, spellcheck: false }" /></div>
          <div class="mcp-editor-field"><label :for="`${prefix}-args`">{{ t.workspace.mcp.args }}</label><NInput v-model:value="form.args" type="textarea" :disabled="busy" :input-props="{ id: `${prefix}-args`, spellcheck: false }" :placeholder="'-y\n@example/mcp-server'" /></div>
          <div class="mcp-editor-field"><label :for="`${prefix}-env`">{{ t.workspace.mcp.env }}</label><NInput v-model:value="form.env" type="textarea" :disabled="busy" :input-props="{ id: `${prefix}-env`, spellcheck: false }" placeholder="API_KEY=${API_KEY}" /></div>
        </template>
        <template v-else>
          <div class="mcp-editor-field"><label :for="`${prefix}-url`">{{ t.workspace.mcp.url }}</label><NInput v-model:value="form.url" :disabled="busy" :input-props="{ id: `${prefix}-url`, spellcheck: false }" placeholder="https://example.com/mcp" /></div>
          <div class="mcp-editor-field"><label :for="`${prefix}-headers`">{{ t.workspace.mcp.headers }}</label><NInput v-model:value="form.headers" type="textarea" :disabled="busy" :input-props="{ id: `${prefix}-headers`, spellcheck: false }" placeholder="Authorization=Bearer ${TOKEN}" /></div>
        </template>
        <p class="mcp-editor-hint">{{ t.workspace.mcp.multilineHint }}</p>
        <div class="mcp-editor-field"><label :for="`${prefix}-timeout`">{{ t.workspace.mcp.timeout }}</label><NInput v-model:value="form.timeout" :disabled="busy" :input-props="{ id: `${prefix}-timeout`, inputmode: 'numeric' }" placeholder="10000" /></div>
        <details v-if="remote" class="mcp-oauth" :open="form.oauthEnabled">
          <summary>{{ t.workspace.mcp.oauth }}</summary>
          <div class="mcp-oauth-fields">
            <p class="mcp-editor-hint">{{ t.workspace.mcp.oauthHint }}</p>
            <label class="mcp-oauth-toggle"><NSwitch v-model:value="form.oauthEnabled" :disabled="busy" :aria-label="t.workspace.mcp.oauthEnabled" />{{ t.workspace.mcp.oauthEnabled }}</label>
            <template v-if="form.oauthEnabled">
              <div class="mcp-editor-field"><label :for="`${prefix}-client-id`">{{ t.workspace.mcp.clientId }}</label><NInput v-model:value="form.clientId" :disabled="busy" :input-props="{ id: `${prefix}-client-id` }" placeholder="" /></div>
              <div class="mcp-editor-field"><label :for="`${prefix}-callback-port`">{{ t.workspace.mcp.callbackPort }}</label><NInput v-model:value="form.callbackPort" :disabled="busy" :input-props="{ id: `${prefix}-callback-port`, inputmode: 'numeric' }" placeholder="8765" /></div>
              <div class="mcp-editor-field"><label :for="`${prefix}-metadata-url`">{{ t.workspace.mcp.authServerMetadataUrl }}</label><NInput v-model:value="form.authServerMetadataUrl" :disabled="busy" :input-props="{ id: `${prefix}-metadata-url` }" placeholder="https://example.com/.well-known/oauth-authorization-server" /></div>
              <div class="mcp-editor-field"><label :for="`${prefix}-scopes`">{{ t.workspace.mcp.scopes }}</label><NInput v-model:value="form.scopes" :disabled="busy" :input-props="{ id: `${prefix}-scopes` }" placeholder="read write" /></div>
            </template>
          </div>
        </details>
      </div>
      <template v-else>
        <p :id="`${prefix}-json-hint`" class="mcp-editor-hint">{{ t.workspace.mcp.jsonHint }}</p>
        <div ref="jsonHost" class="mcp-json-editor" :inert="busy" />
      </template>
    </section>
    <div v-if="remote" class="mcp-editor-field mcp-secret">
      <label :for="`${prefix}-client-secret`">{{ t.workspace.mcp.clientSecret }}</label>
      <NInput v-model:value="clientSecret" type="password" :disabled="busy" :input-props="{ id: `${prefix}-client-secret`, autocomplete: 'new-password', 'aria-describedby': `${prefix}-secret-hint` }" placeholder="" />
      <p class="mcp-editor-hint">{{ server?.clientSecretSet ? t.workspace.mcp.secretSet : t.workspace.mcp.secretUnset }}</p>
      <p :id="`${prefix}-secret-hint`" class="mcp-editor-hint">{{ t.workspace.mcp.secretHint }}</p>
    </div>
    <p class="mcp-editor-hint">{{ t.workspace.mcp.immediateHint }}</p>
    <div class="mcp-editor-actions"><button class="mcp-submit dl-btn dl-btn--primary" type="submit" :disabled="busy || (server !== undefined && (!isDirty || validation !== ''))">{{ busy ? t.workspace.mcp.savingChanges : server ? t.workspace.mcp.saveChanges : t.workspace.mcp.submitAdd }}</button><button class="dl-btn dl-btn--ghost" type="button" :disabled="busy" @click="emit('cancel')">{{ t.workspace.mcp.cancel }}</button></div>
  </form>
</template>

<style scoped>
.mcp-server-editor, .mcp-config-section, .mcp-config-fields, .mcp-oauth-fields { display: grid; gap: var(--dl-space-3); min-inline-size: 0; }
.mcp-editor-field { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.mcp-editor-field label { font-weight: 500; }
.mcp-editor-hint { color: var(--dl-text-secondary); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.mcp-editor-field :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); }
.mcp-editor-field :deep(input), .mcp-editor-field :deep(textarea) { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-sm); }
.mcp-representation { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-representation button { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); color: var(--dl-text-secondary); border-block-end: var(--dl-border-width) solid transparent; }
.mcp-representation button[aria-pressed='true'] { color: var(--dl-accent); border-block-end-color: var(--dl-accent); font-weight: 600; background: var(--dl-bg-hover); }
select { inline-size: 100%; min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); color: var(--dl-text-primary); background: var(--dl-bg-base); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); }
.mcp-json-editor { min-inline-size: 0; max-inline-size: 100%; block-size: calc(var(--dl-space-12) * 6); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); }
.mcp-json-editor:focus-within { box-shadow: var(--dl-focus-ring); }
.mcp-json-editor :deep(.cm-editor) { border-radius: inherit; }
.mcp-json-editor :deep(.cm-scroller) { overflow: auto; }
.mcp-editor-error { position: sticky; inset-block-start: 0; z-index: var(--dl-z-sticky); color: var(--dl-error); background: var(--dl-bg-elevated); overflow-wrap: anywhere; padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-error); border-radius: var(--dl-radius-sm); }
.mcp-oauth { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
summary { cursor: pointer; min-block-size: var(--dl-target-size); padding-block: var(--dl-space-2); color: var(--dl-text-primary); }
.mcp-oauth-toggle, .mcp-editor-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); }
.mcp-secret { padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
button:hover:not(:disabled), summary:hover { background: var(--dl-bg-hover); }
button:active:not(:disabled), summary:active { background: var(--dl-bg-sunken); }
button:focus-visible, select:focus-visible, summary:focus-visible, .mcp-editor-error:focus { outline: none; box-shadow: var(--dl-focus-ring); }
button:disabled, select:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
</style>
