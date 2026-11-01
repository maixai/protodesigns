<script setup lang="ts">
// 受控权限编辑器:只修改父级草稿,不直接调用 API。Agent 与项目共用 deny → ask → allow 的顺序和行交互。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NInput } from 'naive-ui'
import type { PermissionModeId, PermissionRule, PermissionRuleKindId } from '../contracts/generated/agent-permissions'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  scope: 'agent' | 'project'
  ownerId: string
  ownerName?: string
  defaultMode: PermissionModeId | null
  rules: readonly PermissionRule[]
  disabled?: boolean
  idPrefix: string
}>()
const emit = defineEmits<{
  'update:defaultMode': [mode: PermissionModeId | null]
  'update:rules': [rules: PermissionRule[]]
}>()

const { t } = useI18n()
const RULE_ORDER: readonly PermissionRuleKindId[] = ['deny', 'ask', 'allow']
const rootRef = ref<HTMLElement | null>(null)
const modeRootRef = ref<HTMLElement | null>(null)
const modeTriggerRef = ref<HTMLButtonElement | null>(null)
const modeMenuRef = ref<HTMLElement | null>(null)
const isModeOpen = ref(false)
const activeModeIndex = ref(0)
const modeMenuStyle = ref<Record<string, string>>({})
const drafts = ref<Record<string, string>>({})
const formErrors = ref<Record<string, string>>({})
const expandedAddKind = ref<PermissionRuleKindId | null>(null)
let generatedRuleId = 0

function kindLabel(kind: PermissionRuleKindId): string {
  return t.value.workspace.permissions.kinds[kind]
}
function rulesFor(kind?: PermissionRuleKindId): PermissionRule[] {
  return kind === undefined ? [...props.rules] : props.rules.filter((rule) => rule.kind === kind)
}
const PERMISSION_MODE_ORDER: readonly PermissionModeId[] = ['auto', 'default', 'dontAsk', 'bypassPermissions']
const modeOptions = computed<readonly (PermissionModeId | null)[]>(() => props.scope === 'project'
  ? [null, ...PERMISSION_MODE_ORDER]
  : PERMISSION_MODE_ORDER)
function modeLabel(mode: PermissionModeId | null): string {
  const copy = t.value.workspace.permissions
  return mode === null ? copy.inheritMode : copy.modes[mode]
}
function modeOptionLabel(mode: PermissionModeId | null): string {
  const copy = t.value.workspace.permissions
  const label = modeLabel(mode)
  if (mode === 'auto') return `${label} · ${copy.defaultBadge}`
  if (mode === 'bypassPermissions') return `${label} · ${copy.highRisk}`
  return label
}
function modeHint(mode: PermissionModeId | null): string {
  const copy = t.value.workspace.permissions
  return mode === null ? copy.inheritModeHint : copy.modeHints[mode]
}
const modeListId = computed(() => `${props.idPrefix}-mode-list`)
const modeLabelId = computed(() => `${props.idPrefix}-mode-label`)
const selectedModeIndex = computed(() => {
  const index = modeOptions.value.findIndex((option) => option === props.defaultMode)
  return index < 0 ? 0 : index
})
// 视口夹取的几何常量，不是组件视觉取值;间距量级分别对应 space-2 / space-1。
const VIEWPORT_PADDING = 8
const MENU_GAP = 4
function modeOptionId(mode: PermissionModeId | null): string {
  return `${props.idPrefix}-mode-option-${mode ?? 'inherit'}`
}
function modeOptionElements(): HTMLButtonElement[] {
  return Array.from(modeMenuRef.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
}
function focusModeOption(index: number): void {
  const options = modeOptionElements()
  if (options.length === 0) return
  const nextIndex = Math.max(0, Math.min(index, options.length - 1))
  activeModeIndex.value = nextIndex
  const nextOption = options[nextIndex]
  nextOption?.focus({ preventScroll: true })
  // 菜单自身可能滚动:焦点移动后把活动项带回可视区,避免焦点落在裁切区外。
  if (typeof nextOption?.scrollIntoView === 'function') nextOption.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
function placeModeMenu(): void {
  const trigger = modeTriggerRef.value
  const menu = modeMenuRef.value
  if (trigger === null || menu === null) return
  const anchor = trigger.getBoundingClientRect()
  const rect = menu.getBoundingClientRect()
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - rect.width - VIEWPORT_PADDING)
  const left = Math.max(VIEWPORT_PADDING, Math.min(anchor.left, maxLeft))
  let top = anchor.bottom + MENU_GAP
  if (top + rect.height > window.innerHeight - VIEWPORT_PADDING && anchor.top - rect.height - MENU_GAP >= VIEWPORT_PADDING) {
    top = anchor.top - rect.height - MENU_GAP
  }
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - rect.height - VIEWPORT_PADDING)
  top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop))
  modeMenuStyle.value = { left: `${left}px`, top: `${top}px`, width: `${rect.width}px` }
}
async function openMode(): Promise<void> {
  if (props.disabled === true || isModeOpen.value) return
  const trigger = modeTriggerRef.value
  if (trigger === null) return
  activeModeIndex.value = selectedModeIndex.value
  const anchor = trigger.getBoundingClientRect()
  const width = Math.min(anchor.width, Math.max(0, window.innerWidth - 2 * VIEWPORT_PADDING))
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING)
  const left = Math.max(VIEWPORT_PADDING, Math.min(anchor.left, maxLeft))
  // 首帧就放在触发区附近且保持可见:菜单挂载后即可聚焦,随后再按真实高度决定是否上翻。
  modeMenuStyle.value = { left: `${left}px`, top: `${anchor.bottom + MENU_GAP}px`, width: `${width}px` }
  isModeOpen.value = true
  await nextTick()
  if (!isModeOpen.value) return
  placeModeMenu()
  focusModeOption(activeModeIndex.value)
}
async function closeMode(restoreFocus: boolean): Promise<void> {
  if (!isModeOpen.value) return
  isModeOpen.value = false
  await nextTick()
  if (restoreFocus && props.disabled !== true) modeTriggerRef.value?.focus({ preventScroll: true })
}
function toggleMode(): void {
  if (isModeOpen.value) void closeMode(true)
  else void openMode()
}
async function selectMode(mode: PermissionModeId | null): Promise<void> {
  if (props.disabled === true) return
  emit('update:defaultMode', mode)
  await closeMode(true)
}
function onModeKeydown(event: KeyboardEvent): void {
  if (!isModeOpen.value) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    void openMode()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    // 一次 Escape 只关闭模式菜单,不能连带关闭外层设置窗体。
    event.stopPropagation()
    void closeMode(true)
    return
  }
  if (event.key === 'ArrowDown') { event.preventDefault(); focusModeOption(activeModeIndex.value + 1); return }
  if (event.key === 'ArrowUp') { event.preventDefault(); focusModeOption(activeModeIndex.value - 1); return }
  if (event.key === 'Home') { event.preventDefault(); focusModeOption(0); return }
  if (event.key === 'End') { event.preventDefault(); focusModeOption(modeOptions.value.length - 1); return }
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  const mode = modeOptions.value[activeModeIndex.value]
  if (mode !== undefined) void selectMode(mode)
}
function onModeFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && modeRootRef.value?.contains(next) === true) return
  if (isModeOpen.value) void closeMode(false)
}
function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && modeRootRef.value?.contains(target) === true) return
  if (isModeOpen.value) void closeMode(false)
}
function onModeContextChange(): void {
  // 触发区可能因窗口或正文滚动移动;菜单跟随重定位,不被打开前的迟到滚动事件误关。
  if (isModeOpen.value) placeModeMenu()
}
watch(() => props.disabled, (disabled) => {
  if (disabled === true && isModeOpen.value) void closeMode(false)
})
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('scroll', onModeContextChange, true)
  window.addEventListener('resize', onModeContextChange)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('scroll', onModeContextChange, true)
  window.removeEventListener('resize', onModeContextChange)
})
function addRuleLabel(kind: PermissionRuleKindId): string {
  const copy = t.value.workspace.permissions
  return props.scope === 'agent' ? copy.addRuleLabel.replace('{kind}', kindLabel(kind))
    : copy.projectAddRuleLabel.replace('{kind}', kindLabel(kind)).replace('{project}', props.ownerName ?? props.ownerId)
}
function ruleInputLabel(kind: PermissionRuleKindId): string {
  const copy = t.value.workspace.permissions
  return props.scope === 'agent' ? copy.ruleInputLabel.replace('{kind}', kindLabel(kind))
    : copy.projectRuleInputLabel.replace('{kind}', kindLabel(kind)).replace('{project}', props.ownerName ?? props.ownerId)
}
function removeRuleLabel(rule: PermissionRule): string {
  const copy = t.value.workspace.permissions
  return props.scope === 'agent'
    ? copy.removeRuleLabel.replace('{kind}', kindLabel(rule.kind)).replace('{pattern}', rule.pattern)
    : copy.projectRemoveRuleLabel.replace('{kind}', kindLabel(rule.kind)).replace('{pattern}', rule.pattern).replace('{project}', props.ownerName ?? props.ownerId)
}
async function openAdd(kind: PermissionRuleKindId): Promise<void> {
  if (props.disabled === true) return
  expandedAddKind.value = kind
  formErrors.value = { ...formErrors.value, [kind]: '' }
  await nextTick()
  document.getElementById(`${props.idPrefix}-${kind}-rule`)?.focus({ preventScroll: true })
}
async function closeAdd(kind: PermissionRuleKindId): Promise<void> {
  expandedAddKind.value = null
  drafts.value = { ...drafts.value, [kind]: '' }
  formErrors.value = { ...formErrors.value, [kind]: '' }
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>(`[data-add-kind="${kind}"]`)?.focus({ preventScroll: true })
}
async function addRule(kind: PermissionRuleKindId): Promise<void> {
  if (props.disabled === true) return
  const copy = t.value.workspace.permissions
  const pattern = drafts.value[kind]?.trim() ?? ''
  formErrors.value = { ...formErrors.value, [kind]: '' }
  if (pattern === '') { formErrors.value = { ...formErrors.value, [kind]: copy.requiredRule }; return }
  if (/[\r\n]/.test(pattern)) { formErrors.value = { ...formErrors.value, [kind]: copy.invalidRule }; return }
  if (props.rules.some((rule) => rule.pattern === pattern)) {
    formErrors.value = { ...formErrors.value, [kind]: copy.duplicateRule }
    return
  }
  generatedRuleId += 1
  const rule: PermissionRule = {
    id: `${props.scope}-${props.ownerId}-${kind}-draft-${Date.now()}-${generatedRuleId}`,
    kind, pattern, scope: props.scope, ownerId: props.ownerId,
  }
  emit('update:rules', [...props.rules, rule])
  drafts.value = { ...drafts.value, [kind]: '' }
  expandedAddKind.value = null
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>(`[data-add-kind="${kind}"]`)?.focus({ preventScroll: true })
}
async function removeRule(rule: PermissionRule): Promise<void> {
  if (props.disabled === true) return
  const siblings = rulesFor(rule.kind)
  const index = siblings.findIndex((item) => item.id === rule.id)
  const nextRule = siblings[index + 1]
  emit('update:rules', props.rules.filter((item) => item.id !== rule.id))
  await nextTick()
  const nextElement = nextRule === undefined ? null : [...rootRef.value?.querySelectorAll<HTMLElement>('[data-rule-id]') ?? []]
    .find((element) => element.dataset['ruleId'] === nextRule.id)
  const fallback = rootRef.value?.querySelector<HTMLElement>(`[data-add-kind="${rule.kind}"]`)
  ;(nextElement ?? fallback)?.focus({ preventScroll: true })
}
</script>

<template>
  <section ref="rootRef" class="agent-permissions permission-editor" :data-scope="scope">
    <div ref="modeRootRef" class="permissions-mode" @keydown="onModeKeydown" @focusout="onModeFocusOut">
      <label :id="modeLabelId" :for="`${idPrefix}-mode`">{{ scope === 'agent' ? t.workspace.permissions.defaultMode : t.workspace.permissions.mode }}</label>
      <button
        :id="`${idPrefix}-mode`"
        ref="modeTriggerRef"
        type="button"
        class="permissions-select"
        data-mode-trigger
        :disabled="disabled"
        :aria-labelledby="`${modeLabelId} ${idPrefix}-mode-value`"
        aria-haspopup="listbox"
        :aria-expanded="isModeOpen"
        :aria-controls="isModeOpen ? modeListId : undefined"
        @click="toggleMode"
      >
        <span :id="`${idPrefix}-mode-value`" class="permissions-selected">{{ modeOptionLabel(defaultMode) }}</span>
        <DliIcon name="chevronDown" size="sm" class="permissions-chevron" />
      </button>
      <div v-if="isModeOpen" :id="modeListId" ref="modeMenuRef" class="permissions-menu" :style="modeMenuStyle" role="listbox" :aria-labelledby="modeLabelId">
        <button
          v-for="(option, index) in modeOptions"
          :id="modeOptionId(option)"
          :key="option ?? 'inherit'"
          type="button"
          role="option"
          class="permissions-option"
          :data-mode="option ?? 'inherit'"
          :aria-selected="option === defaultMode"
          :tabindex="index === activeModeIndex ? 0 : -1"
          @focus="activeModeIndex = index"
          @click="selectMode(option)"
        >
          <span class="permissions-option-check"><DliIcon v-if="option === defaultMode" name="check" size="sm" /></span>
          <span class="permissions-option-text">
            <span class="permissions-option-name">{{ modeOptionLabel(option) }}</span>
            <span class="permissions-option-hint">{{ modeHint(option) }}</span>
          </span>
        </button>
      </div>
    </div>
    <p v-if="rules.length === 0" class="permissions-empty">{{ t.workspace.permissions.emptyAgent }}</p>
    <section v-for="kind in RULE_ORDER" :key="kind" class="permissions-rules" :data-kind="kind">
      <div class="permissions-rules-head"><h4>{{ kindLabel(kind) }}<code>{{ kind }}</code><span class="permissions-count">{{ rulesFor(kind).length }}</span></h4><p>{{ t.workspace.permissions.kindHints[kind] }}</p></div>
      <ul v-if="rulesFor(kind).length > 0" class="permissions-rule-list">
        <li v-for="rule in rulesFor(kind)" :key="rule.id"><code>{{ rule.pattern }}</code><button type="button" class="permissions-remove" :data-rule-id="rule.id" :disabled="disabled" :aria-label="removeRuleLabel(rule)" @click="removeRule(rule)"><span aria-hidden="true">✕</span></button></li>
      </ul>
      <p v-else class="permissions-empty">{{ t.workspace.permissions.emptyKind }}</p>
      <button v-if="expandedAddKind !== kind" type="button" class="permissions-action permissions-add" :data-add-kind="kind" :disabled="disabled" :aria-label="addRuleLabel(kind)" @click="openAdd(kind)"><span aria-hidden="true">＋</span></button>
      <form v-else class="permissions-add-form" @submit.prevent="addRule(kind)">
        <NInput :value="drafts[kind] ?? ''" @update:value="drafts[kind] = $event" :disabled="disabled" :placeholder="t.workspace.permissions.rulePlaceholder" :input-props="{ id: `${idPrefix}-${kind}-rule`, 'aria-label': ruleInputLabel(kind), spellcheck: false, autocomplete: 'off' }" />
        <button type="submit" class="permissions-action" :disabled="disabled">{{ t.workspace.permissions.addRule }}</button>
        <button type="button" class="permissions-action" :disabled="disabled" @click="closeAdd(kind)">{{ t.workspace.permissions.cancel }}</button>
      </form>
      <p v-if="formErrors[kind]" class="permissions-error" role="alert">{{ formErrors[kind] }}</p>
    </section>
  </section>
</template>

<style scoped>
.agent-permissions { min-inline-size: 0; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.permission-editor { display: grid; gap: var(--dl-space-3); }
.permissions-mode { display: grid; gap: var(--dl-space-2); }
.permissions-mode label { font-weight: 500; }
.permissions-select { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-snug); text-align: start; }
.permissions-select:hover:not(:disabled) { border-color: var(--dl-border-strong); background: var(--dl-bg-hover); }
.permissions-select:active:not(:disabled) { background: var(--dl-bg-sunken); }
.permissions-select:disabled { background: var(--dl-bg-sunken); }
.permissions-selected { min-inline-size: 0; overflow-wrap: anywhere; }
.permissions-chevron { flex: none; color: var(--dl-text-secondary); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.permissions-select[aria-expanded='true'] .permissions-chevron { transform: rotate(180deg); }
.permissions-menu { position: fixed; z-index: var(--dl-z-overlay); display: grid; gap: var(--dl-space-1); box-sizing: border-box; max-inline-size: calc(100vw - 2 * var(--dl-space-3)); max-block-size: calc(100dvh - 2 * var(--dl-space-3)); overflow-y: auto; padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.permissions-option { display: grid; grid-template-columns: var(--dl-icon-sm) minmax(0, 1fr); align-items: start; gap: var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-md); text-align: start; }
.permissions-option[aria-selected='true'] { background: var(--dl-accent-soft); }
.permissions-option-check { display: inline-flex; align-items: center; min-block-size: var(--dl-icon-sm); color: var(--dl-accent); }
.permissions-option-text { display: grid; gap: var(--dl-space-1); min-inline-size: 0; }
.permissions-option-name { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.permissions-option-hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.permissions-empty { color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.permissions-rules { display: grid; gap: var(--dl-space-2); min-inline-size: 0; padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-raised); }
.permissions-rules-head { display: grid; gap: var(--dl-space-1); }
.permissions-rules-head h4 { display: flex; align-items: baseline; gap: var(--dl-space-2); font-size: var(--dl-font-size-sm); font-weight: 500; }
.permissions-rules-head h4 code { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-weight: 400; }
.permissions-rules-head p { color: var(--dl-text-tertiary); }
.permissions-count { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-weight: 400; }
.permissions-rule-list { display: grid; }
.permissions-rule-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--dl-space-1); padding-block: var(--dl-space-1); }
.permissions-rule-list li + li { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.permissions-rule-list code { color: var(--dl-text-primary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.permissions-remove { display: inline-grid; place-items: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.permissions-add-form { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: start; gap: var(--dl-space-1); min-inline-size: 0; }
.permissions-add-form :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.permissions-action { display: inline-flex; align-items: center; justify-content: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); }
.permissions-add { justify-self: start; }
.permissions-error { padding: var(--dl-space-2); border: var(--dl-border-width) solid color-mix(in srgb, var(--dl-error) 35%, transparent); border-radius: var(--dl-radius-md); background: color-mix(in srgb, var(--dl-error) 8%, transparent); color: var(--dl-error); overflow-wrap: anywhere; }
.agent-permissions button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.agent-permissions button:focus-visible, .permissions-select:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.agent-permissions button:active:not(:disabled) { background: var(--dl-bg-sunken); }
.agent-permissions button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 560px) {
  .permissions-add-form { grid-template-columns: minmax(0, 1fr); }
  .permissions-add-form .permissions-action { justify-self: start; }
}
</style>
