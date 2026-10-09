<script setup lang="ts">
// 「打开项目」对话框:列出 Agent Host 上检测到的候选目录,可搜索、可勾选,确认后加入项目列表。
// 用原生 dialog.showModal()(与 confirm-dialog 同范式):自带焦点陷阱、Esc 关闭与 aria-modal
// 语义;top layer 内仍继承 .dl-scope--dark 的 CSS 变量,故不 Teleport,避免脱离深色作用域。
//
// 受控:触发与关闭由父级用 open 决定;候选列表由本组件在打开时自行取回(自带 loading /
// empty / error 三态)。已打开的项目在列表里标「已打开」且不可重复勾选 —— 按 path 判重,
// 因为不同父目录下可能有同名目录。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentId } from '../contracts/generated/chat-session'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import { listProjectCandidates } from '../api/workspace'
import { useI18n } from '../i18n'

const props = defineProps<{ open: boolean; agentId: AgentId; openPaths: readonly string[] }>()
const emit = defineEmits<{ confirm: [paths: string[]]; cancel: [] }>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const candidates = ref<ProjectCandidate[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const query = ref('')
const selected = ref<string[]>([])
const dialogId = `project-picker-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const searchId = `${dialogId}-search`

// 搜索按 name / path 过滤(目录名可能重名,路径是唯一标识)。
const filtered = computed<ProjectCandidate[]>(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return candidates.value
  return candidates.value.filter((candidate) => candidate.name.toLowerCase().includes(needle) || candidate.path.toLowerCase().includes(needle))
})

const selectedCount = computed(() => selected.value.length)

function isOpenPath(path: string): boolean {
  return props.openPaths.includes(path)
}

// 每次打开都重新取候选目录并清空上次的勾选 / 搜索词,避免残留状态。
async function load(): Promise<void> {
  status.value = 'loading'
  selected.value = []
  query.value = ''
  const result = await listProjectCandidates(props.agentId)
  if (result.ok) {
    candidates.value = result.value
    status.value = 'ready'
  } else {
    status.value = 'error'
  }
}

watch(() => props.open, async (isOpen): Promise<void> => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) {
    if (dialog.open) dialog.close()
    return
  }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  dialog.showModal()
  void load()
  // 初始焦点落在搜索框:打开对话框最常见的意图就是找某个目录。
  searchRef.value?.focus()
}, { immediate: true })

function finish(action: 'confirm' | 'cancel'): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  if (action === 'confirm') emit('confirm', [...selected.value])
  else emit('cancel')
}

function toggle(path: string): void {
  const index = selected.value.indexOf(path)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(path)
}

function formatFileCount(count: number): string {
  return t.value.workspace.fileCount.replace('{count}', String(count))
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  // dialog 内留白仍属于内容区,只有边界外的遮罩点击才取消。
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish('cancel')
}

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef"
    class="picker"
    aria-modal="true"
    :aria-labelledby="titleId"
    @cancel.prevent="finish('cancel')"
    @click="onBackdropClick"
  >
    <h2 :id="titleId" class="picker__title">{{ t.workspace.pickerTitle }}</h2>

    <div class="picker__search">
      <input
        :id="searchId" ref="searchRef" v-model="query" type="text" class="picker__search-input"
        :aria-label="t.workspace.pickerSearch" :placeholder="t.workspace.pickerSearch" autocomplete="off"
      >
    </div>

    <div class="picker__body">
      <p v-if="status === 'loading'" class="picker__hint">{{ t.workspace.treeLoading }}</p>
      <p v-else-if="status === 'error'" class="picker__hint picker__hint--error">{{ t.workspace.projectsError }}</p>
      <p v-else-if="filtered.length === 0" class="picker__hint">
        {{ query ? t.workspace.pickerSearchEmpty : t.workspace.pickerEmpty }}
      </p>
      <ul v-else class="picker__list">
        <li v-for="candidate in filtered" :key="candidate.path" class="picker__item" :data-open="isOpenPath(candidate.path) ? 'true' : undefined">
          <label class="picker__label">
            <input
              type="checkbox" class="picker__check"
              :checked="selected.includes(candidate.path)" :disabled="isOpenPath(candidate.path)"
              @change="toggle(candidate.path)"
            >
            <span class="picker__text">
              <span class="picker__name">
                {{ candidate.name }}
                <span v-if="isOpenPath(candidate.path)" class="picker__badge">{{ t.workspace.pickerAlreadyOpen }}</span>
              </span>
              <span class="picker__path">{{ candidate.path }}</span>
              <span class="picker__meta">
                {{ formatFileCount(candidate.fileCount) }}<template v-if="candidate.isGitRepo"> · {{ t.workspace.pickerGit }}</template>
              </span>
            </span>
          </label>
        </li>
      </ul>
    </div>

    <div class="picker__actions">
      <button type="button" class="dl-btn dl-btn--ghost dl-btn--lg" @click="finish('cancel')">{{ t.workspace.pickerCancel }}</button>
      <button type="button" class="dl-btn dl-btn--primary dl-btn--lg" :disabled="selectedCount === 0" @click="finish('confirm')">{{ t.workspace.pickerOpen }}</button>
    </div>
  </dialog>
</template>

<style scoped>
/* display 只在 [open] 时设成 flex:未打开的原生 dialog 由 UA 样式表设为 display:none,
   作者样式一旦无条件覆盖它,关闭态的对话框会留在普通文档流里占据版面(并让其中的搜索框
   留在可访问树里)。 */
.picker[open] {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-4);
}

.picker {
  width: min(var(--dl-measure), calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
  overflow: hidden;
}

.picker::backdrop {
  background-color: var(--dl-bg-sunken);
}

.picker__title {
  font-size: var(--dl-font-size-xl);
  font-weight: 600;
  line-height: var(--dl-line-body);
}

/* 搜索框沿用输入框配方:抬起底 + 发丝描边,聚焦时描边加强并加焦点环。 */
.picker__search-input {
  width: 100%;
  min-height: var(--dl-control-height);
  padding: 0 var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-base);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
}

.picker__search-input:hover {
  border-color: var(--dl-border-strong);
}

.picker__search-input:focus-visible {
  border-color: var(--dl-border-strong);
}

/* 列表自身滚动:对话框有最大高度,候选目录可能很多。 */
.picker__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--dl-space-1);
  margin: calc(-1 * var(--dl-space-1));
}

.picker__hint {
  padding-block: var(--dl-space-6);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
}

.picker__hint--error {
  color: var(--dl-error);
}

.picker__list {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.picker__item {
  border-radius: var(--dl-radius-md);
}

/* 整行是一个 label:点行内任意处即可切换勾选,触达面积足够。 */
.picker__label {
  display: flex;
  align-items: flex-start;
  gap: var(--dl-space-3);
  padding: var(--dl-space-2) var(--dl-space-3);
  border-radius: var(--dl-radius-md);
  min-height: var(--dl-target-size);
}

.picker__label:hover {
  background: var(--dl-bg-hover);
}

.picker__item[data-open='true'] .picker__label:hover {
  background: none;
}

.picker__check {
  flex-shrink: 0;
  width: var(--dl-icon-md);
  height: var(--dl-icon-md);
  margin-top: var(--dl-space-1);
  accent-color: var(--dl-accent);
}

.picker__check:disabled {
  cursor: not-allowed;
}

.picker__text {
  min-width: 0;
  display: grid;
  gap: var(--dl-space-1);
}

.picker__name {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.picker__item[data-open='true'] .picker__name {
  color: var(--dl-text-secondary);
}

/* 「已打开」标记:中性描边芯片,不用强调色(它不是行动点,只是状态)。 */
.picker__badge {
  flex-shrink: 0;
  padding: 0 var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

/* 路径是技术信息,走等宽字体;单行省略。 */
.picker__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.picker__meta {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.picker__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--dl-space-3);
}

.picker__actions .dl-btn {
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}
</style>
