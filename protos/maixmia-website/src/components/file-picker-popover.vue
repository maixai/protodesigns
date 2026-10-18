<script setup lang="ts">
// 文件选择浮层:文件分组段尾的 ＋ 打开它。
//
// 它要回答的问题与「文件树 / 最近关闭」不同:用户在 tab 条上点「文件 +」时,想要的是
// **在这个区域里再打开一个文件**,而不是切到已经在别处打开的那个。故浮层把「已打开的项目」
// 全量摆出来:上方是搜索框,下方是按项目分组的文件树。搜索把跨项目的深层文件一次捞出来,
// 浏览则保留目录层级 —— 两者共用同一个焦点模型,键盘不必在两套列表之间换脑子。
//
// 交互与语义(对齐 APG 的 tree / listbox 与命令面板的通行做法):
//   · 打开即聚焦搜索框;输入即过滤,**不需要先切模式**;
//   · 搜索态是 listbox(扁平的匹配结果),浏览态是 tree(项目根 → 目录 → 文件);
//   · ↓ 从搜索框进入结果;↑ 在首行回到搜索框;Home / End 到首尾;
//   · 浏览态:Enter / Space 展开目录或打开文件;→ 展开或进入子项,← 收起或回到父项;
//   · Enter 在搜索框里直接打开第一个结果 —— 命令面板的既定手感,少按一次 ↓;
//   · Esc / 点浮层外 / Tab 离开 = 取消;取消时把焦点还给 ＋(选中文件时不还 —— 焦点该落到新 tab)。
//
// 组件是受控的:项目、各项目的树、加载状态与文件状态芯片都由页面给;组件只请求「打开哪个文件 /
// 重试哪个项目 / 去打开项目」,不自己取数。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProjectEntry, ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { Project } from '../contracts/generated/project'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { buildProjectTree, directoryKey, flattenProjectTree } from '../data/project-tree'
import { badgeMapOf } from '../data/project-identity'
import type { ProjectBadge } from '../data/project-identity'
import { fileBaseName, fileDirName } from '../data/windows'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  // 当前 Agent 已打开的全部项目(按侧栏顺序;顺序不重排,用户靠位置记忆)。
  projects: Project[]
  // 各项目的扁平条目(契约口径)。尚未加载的项目没有键。
  projectTrees: Readonly<Record<string, ProjectEntry[]>>
  // 各项目树的加载状态。缺键按 loading 处理(页面会在打开浮层时触发加载)。
  treeStatus: Readonly<Record<string, 'loading' | 'ready' | 'error'>>
  // 文件在当前会话里的状态(与文件树 / 文件栏同源):created / modified / pending / none。
  stateOf: (projectId: string, path: string) => ProjectEntryStateId
  // ＋ 的视口矩形(浮层锚点)。
  anchor: WindowRect
}>()

const emit = defineEmits<{
  select: [projectId: string, path: string]
  cancel: []
  retry: [projectId: string]
  'open-project': []
}>()

const { t } = useI18n()

const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
// 取消时把焦点还给打开浮层的那个 ＋。挂载瞬间记下当前焦点持有者 —— 浮层自己还没有挂上,
// 此时 activeElement 就是触发钮(与 project-picker-popover 同一套做法)。
const returnFocusRef = ref<HTMLElement | null>(
  typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null,
)
const query = ref('')
// 项目根的展开集:默认全部展开 —— 用户点「文件 +」就是来找文件的,先展开一层比再点一次更快。
const expandedProjects = ref<Set<string>>(new Set(props.projects.map((project) => project.id)))
// 目录的展开集。键带项目维度(不同项目可以有同名目录),与侧栏共用同一个键口径。
const expandedDirs = ref<Set<string>>(new Set())
const focusedKey = ref('')
const placement = ref<'below' | 'above'>('below')
const panelStyle = ref<Record<string, string>>({})

const TRIGGER_SELECTOR = '[data-file-picker-trigger]'
const VIEW_PADDING = 8
const PANEL_WIDTH = 420
const MAX_PANEL_HEIGHT = 480
// 下方剩余空间小于这个值时上翻。用于「区域贴视口底部」的极端布局;正常从顶部栏打开时
// 下方空间远大于它,浮层会按预期向下展开。
const FLIP_THRESHOLD = 280

const badges = computed<Map<string, ProjectBadge>>(() => badgeMapOf(props.projects))
function badgeOf(projectId: string): ProjectBadge | undefined {
  return badges.value.get(projectId)
}
function identityClassOf(projectId: string): string {
  return badgeOf(projectId)?.identityClass ?? ''
}
function projectNameOf(projectId: string): string {
  return badgeOf(projectId)?.name ?? projectId
}
function statusOf(projectId: string): 'loading' | 'ready' | 'error' {
  return props.treeStatus[projectId] ?? 'loading'
}
function entriesOf(projectId: string): ProjectEntry[] {
  return props.projectTrees[projectId] ?? []
}
function fileCountOf(projectId: string): number {
  return entriesOf(projectId).filter((entry) => entry.kind === 'file').length
}

// ---- 搜索:跨项目、按路径匹配 ----
const isSearching = computed(() => query.value.trim().length > 0)
// 全部可打开的文件(项目顺序 + 路径排序)。搜索与计数共用这一份,不在模板里各算一次。
const allFiles = computed(() => props.projects.flatMap((project) => entriesOf(project.id)
  .filter((entry) => entry.kind === 'file')
  .map((entry) => ({ projectId: project.id, path: entry.path }))
  .sort((a, b) => a.path.localeCompare(b.path))))
const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (needle === '') return []
  return allFiles.value.filter((file) => `${projectNameOf(file.projectId)}/${file.path}`.toLowerCase().includes(needle))
})
const anyLoading = computed(() => props.projects.some((project) => statusOf(project.id) === 'loading'))
const allReady = computed(() => props.projects.length > 0 && props.projects.every((project) => statusOf(project.id) === 'ready'))
const totalFiles = computed(() => props.projects.reduce((sum, project) => sum + fileCountOf(project.id), 0))

// ---- 可见行:浏览态是树,搜索态是扁平结果 ----
interface PickerRow {
  key: string
  kind: 'project' | 'directory' | 'file'
  projectId: string
  path: string
  name: string
  level: number
  expandable: boolean
  expanded: boolean
  fileCount: number
}

function projectKey(projectId: string): string {
  return `project:${projectId}`
}
function dirKey(projectId: string, path: string): string {
  return `dir:${projectId}::${path}`
}
function fileKey(projectId: string, path: string): string {
  return `file:${projectId}::${path}`
}

const treeRows = computed<PickerRow[]>(() => {
  const rows: PickerRow[] = []
  for (const project of props.projects) {
    const status = statusOf(project.id)
    const expanded = expandedProjects.value.has(project.id)
    const count = fileCountOf(project.id)
    rows.push({
      key: projectKey(project.id),
      kind: 'project',
      projectId: project.id,
      path: '',
      name: project.name,
      level: 1,
      expandable: status === 'ready' && count > 0,
      expanded,
      fileCount: count,
    })
    if (!expanded || status !== 'ready') continue
    const entries = entriesOf(project.id)
    if (entries.length === 0) continue
    // flattenProjectTree 的 level 从 1 起;项目根占第 1 级,故树行整体下移一级。
    for (const row of flattenProjectTree(buildProjectTree(entries), project.id, expandedDirs.value)) {
      rows.push({
        key: row.kind === 'directory' ? dirKey(project.id, row.path) : fileKey(project.id, row.path),
        kind: row.kind,
        projectId: project.id,
        path: row.path,
        name: row.name,
        level: row.level + 1,
        expandable: row.expandable,
        expanded: expandedDirs.value.has(directoryKey(project.id, row.path)),
        fileCount: 0,
      })
    }
  }
  return rows
})

const searchRows = computed<PickerRow[]>(() => matches.value.map((file) => ({
  key: fileKey(file.projectId, file.path),
  kind: 'file' as const,
  projectId: file.projectId,
  path: file.path,
  name: fileBaseName(file.path),
  level: 1,
  expandable: false,
  expanded: false,
  fileCount: 0,
})))

const visibleRows = computed<PickerRow[]>(() => (isSearching.value ? searchRows.value : treeRows.value))

// roving tabindex:焦点走过的行优先;焦点行消失(切到搜索 / 树重算)时回落到首行。
const tabStopKey = computed(() => {
  const rows = visibleRows.value
  if (rows.length === 0) return ''
  if (rows.some((row) => row.key === focusedKey.value)) return focusedKey.value
  return rows[0]?.key ?? ''
})

// 搜索词变化时清掉旧焦点(旧行可能已经不在结果里);清空按钮把焦点还给搜索框。
watch(query, () => { focusedKey.value = '' })

// ---- 行操作 ----
function focusRow(key: string): void {
  if (key === '') return
  focusedKey.value = key
  panelRef.value?.querySelector<HTMLElement>(`[data-file-picker-row="${CSS.escape(key)}"]`)?.focus()
}

function toggleProject(projectId: string): void {
  const next = new Set(expandedProjects.value)
  if (next.has(projectId)) next.delete(projectId)
  else next.add(projectId)
  expandedProjects.value = next
}

function toggleDirectory(projectId: string, path: string): void {
  const key = directoryKey(projectId, path)
  const next = new Set(expandedDirs.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedDirs.value = next
}

function activateRow(row: PickerRow): void {
  focusRow(row.key)
  if (row.kind === 'file') {
    emit('select', row.projectId, row.path)
    return
  }
  if (row.kind === 'project') {
    // 加载失败时,项目行本身就是重试入口(行内 meta 写着「加载失败 · 重试」)。
    if (statusOf(row.projectId) === 'error') {
      emit('retry', row.projectId)
      return
    }
    toggleProject(row.projectId)
    return
  }
  toggleDirectory(row.projectId, row.path)
}

function clearSearch(): void {
  query.value = ''
  searchRef.value?.focus()
}

// 高亮首个匹配片段;没有匹配时原样返回一段。只用于文件名 —— 路径里命中时文件名不一定命中,
// 但路径本身仍以次要行完整显示。
interface TextPart { text: string; match: boolean }
function highlightParts(text: string): TextPart[] {
  const needle = query.value.trim()
  if (needle === '') return [{ text, match: false }]
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return [{ text, match: false }]
  return [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + needle.length), match: true },
    { text: text.slice(index + needle.length), match: false },
  ].filter((part) => part.text !== '')
}

// 搜索结果的次要行:项目名 › 目录(根目录用 '/' 占位)。打开集跨项目,出处必须写全。
function locationOf(row: PickerRow): string {
  const dir = fileDirName(row.path)
  return `${projectNameOf(row.projectId)} › ${dir === '' ? '/' : dir}`
}

function projectMeta(row: PickerRow): string {
  const status = statusOf(row.projectId)
  if (status === 'loading') return t.value.workspace.filePicker.loading
  if (status === 'error') return `${t.value.workspace.filePicker.error} · ${t.value.workspace.filePicker.retry}`
  return t.value.workspace.filePicker.projectCount.replace('{count}', String(row.fileCount))
}

function chipLabel(projectId: string, path: string): string | null {
  const state = props.stateOf(projectId, path)
  if (state === 'none') return null
  return t.value.workspace.entryStates[state]
}

// ---- 键盘(搜索框 + 行共用一套)----
function moveFocus(delta: number): void {
  const rows = visibleRows.value
  if (rows.length === 0) return
  const current = rows.findIndex((row) => row.key === focusedKey.value)
  const next = current < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, current + delta))
  const row = rows[next]
  if (row !== undefined) focusRow(row.key)
}

function focusParent(row: PickerRow): void {
  const rows = visibleRows.value
  const index = rows.findIndex((item) => item.key === row.key)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = rows[cursor]
    if (candidate !== undefined && candidate.level < row.level) {
      focusRow(candidate.key)
      return
    }
  }
}

function focusFirstChild(row: PickerRow): void {
  const rows = visibleRows.value
  const index = rows.findIndex((item) => item.key === row.key)
  const candidate = rows[index + 1]
  if (candidate !== undefined && candidate.level > row.level) focusRow(candidate.key)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel(true)
    return
  }
  const target = event.target
  const onSearch = target instanceof HTMLInputElement
  const rows = visibleRows.value
  if (onSearch) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusRow(rows[0]?.key ?? '')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const first = rows[0]
      if (first === undefined) return
      // 搜索态直接打开第一个结果;浏览态先把焦点交给首行,避免一次 Enter 意外展开某个项目。
      if (isSearching.value) activateRow(first)
      else focusRow(first.key)
    }
    return
  }
  const row = rows.find((item) => item.key === focusedKey.value)
  if (row === undefined) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateRow(row)
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocus(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    const index = rows.findIndex((item) => item.key === row.key)
    if (index <= 0) searchRef.value?.focus()
    else moveFocus(-1)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    focusRow(rows[0]?.key ?? '')
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    focusRow(rows[rows.length - 1]?.key ?? '')
    return
  }
  // 浏览态的树导航:→ 展开 / 进入子项,← 收起 / 回到父项。搜索态是扁平结果,不套这层语义。
  if (isSearching.value) return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (!row.expandable) return
    if (!row.expanded) activateRow(row)
    else focusFirstChild(row)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (row.expandable && row.expanded) activateRow(row)
    else focusParent(row)
  }
}

// ---- 关闭 ----
function cancel(restoreFocus: boolean): void {
  if (restoreFocus) returnFocusRef.value?.focus()
  emit('cancel')
}

function isTriggerElement(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(TRIGGER_SELECTOR) !== null
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && panelRef.value?.contains(next) === true) return
  // 焦点回到触发钮时不要先关再开:触发钮的 click 会走页面的 toggle,这里只负责让路。
  if (isTriggerElement(next)) return
  cancel(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && panelRef.value?.contains(target) === true) return
  // 同上:按在触发钮上不当作「点外面」;关闭由触发钮的 toggle 决定。
  if (isTriggerElement(target)) return
  cancel(false)
}

// ---- 定位:默认向下展开,下方不够则上翻;横向夹进视口 ----
function placePanel(): void {
  if (typeof window === 'undefined') return
  const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEW_PADDING * 2)
  // 右缘对齐 ＋ 的右缘(＋ 在标题行右侧,左对齐会把面板推到屏幕中间);再夹进视口。
  const preferredLeft = props.anchor.x + props.anchor.width - width
  const left = Math.min(Math.max(preferredLeft, VIEW_PADDING), window.innerWidth - width - VIEW_PADDING)
  const below = window.innerHeight - (props.anchor.y + props.anchor.height) - VIEW_PADDING
  const above = props.anchor.y - VIEW_PADDING
  placement.value = below < FLIP_THRESHOLD && above > below ? 'above' : 'below'
  const style: Record<string, string> = {
    left: `${left}px`,
    width: `${width}px`,
  }
  if (placement.value === 'below') {
    style['top'] = `${props.anchor.y + props.anchor.height + VIEW_PADDING}px`
    style['maxHeight'] = `${Math.max(200, Math.min(MAX_PANEL_HEIGHT, below))}px`
  } else {
    style['bottom'] = `${window.innerHeight - props.anchor.y + VIEW_PADDING}px`
    style['maxHeight'] = `${Math.max(200, Math.min(MAX_PANEL_HEIGHT, above))}px`
  }
  panelStyle.value = style
}

onMounted(async () => {
  placePanel()
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('resize', placePanel)
  await nextTick()
  searchRef.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', placePanel)
})
</script>

<template>
  <div
    ref="panelRef"
    class="file-picker"
    role="dialog"
    :aria-label="t.workspace.filePicker.title"
    :style="panelStyle"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <!-- 搜索框常驻在顶部:打开即可输入,不需要先切到「搜索模式」。 -->
    <div class="file-picker__search">
      <DliIcon class="file-picker__search-icon" name="search" size="sm" />
      <input
        ref="searchRef"
        v-model="query"
        type="text"
        class="file-picker__input"
        name="file-picker-search"
        :aria-label="t.workspace.filePicker.search"
        :placeholder="t.workspace.filePicker.searchPlaceholder"
        autocomplete="off"
        spellcheck="false"
      >
      <button v-if="query" type="button" class="file-picker__clear" :aria-label="t.workspace.clearSearch" @click="clearSearch">×</button>
    </div>

    <div class="file-picker__scroll">
      <!-- 空项目:给出明确的下一步,而不是一片空白。 -->
      <div v-if="projects.length === 0" class="file-picker__state">
        <p>{{ t.workspace.filePicker.noProjects }}</p>
        <button type="button" class="file-picker__action" @click="emit('open-project')">{{ t.workspace.filePicker.openProject }}</button>
      </div>
      <template v-else>
        <p class="file-picker__caption">
          {{ isSearching ? t.workspace.filePicker.results : t.workspace.filePicker.tree }}
          <span v-if="isSearching" class="file-picker__caption-count">{{ matches.length }}</span>
        </p>

        <!-- 搜索无结果:先区分「还在加载」与「真的没有」,否则用户会把加载中误读成不存在。 -->
        <div v-if="isSearching && matches.length === 0" class="file-picker__state">
          <p>{{ anyLoading ? t.workspace.filePicker.loading : t.workspace.filePicker.noMatches }}</p>
        </div>

        <!-- 浏览态的项目行本身就是树根:即使某个项目加载失败,它仍占一行并显示「加载失败 · 重试」。 -->
        <div
          v-if="!isSearching || matches.length > 0"
          class="file-picker__list"
          :role="isSearching ? 'listbox' : 'tree'"
          :aria-label="isSearching ? t.workspace.filePicker.results : t.workspace.filePicker.tree"
        >
          <div
            v-for="row in visibleRows"
            :key="row.key"
            class="file-picker__row"
            :class="[
              `file-picker__row--${row.kind}`,
              row.kind === 'project' ? identityClassOf(row.projectId) : '',
            ]"
            :role="isSearching ? 'option' : 'treeitem'"
            :aria-level="isSearching ? undefined : row.level"
            :aria-expanded="!isSearching && row.expandable ? row.expanded : undefined"
            :aria-selected="focusedKey === row.key ? 'true' : undefined"
            :tabindex="row.key === tabStopKey ? 0 : -1"
            :data-file-picker-row="row.key"
            :data-kind="row.kind"
            :style="{ '--picker-depth': String(Math.max(0, row.level - 1)) }"
            :title="row.kind === 'file' ? row.path : undefined"
            @click="activateRow(row)"
            @focus="focusedKey = row.key"
          >
            <template v-if="row.kind === 'project'">
              <span class="file-picker__dot" aria-hidden="true" />
              <svg class="file-picker__caret" :class="{ 'is-open': row.expanded }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              <span class="file-picker__name">{{ row.name }}</span>
              <span class="file-picker__meta" :data-error="statusOf(row.projectId) === 'error' ? 'true' : undefined">{{ projectMeta(row) }}</span>
            </template>
            <template v-else>
              <span v-if="row.kind === 'directory'" class="file-picker__caret-slot" aria-hidden="true">
                <svg class="file-picker__caret" :class="{ 'is-open': row.expanded }" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" /></svg>
              </span>
              <DliIcon v-else class="file-picker__file-icon" name="fileText" size="sm" />
              <span class="file-picker__body">
                <span class="file-picker__name">
                  <template v-for="(part, index) in highlightParts(row.name)" :key="index">
                    <mark v-if="part.match">{{ part.text }}</mark><template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <span v-if="isSearching" class="file-picker__path">{{ locationOf(row) }}</span>
              </span>
              <span v-if="row.kind === 'file' && chipLabel(row.projectId, row.path)" class="file-picker__chip" :data-state="stateOf(row.projectId, row.path)">{{ chipLabel(row.projectId, row.path) }}</span>
            </template>
          </div>
        </div>

        <!-- 浏览态的项目全都就绪但没有文件:空态要说清楚是「没有文件」,不是「没加载出来」。 -->
        <div v-if="!isSearching && allReady && totalFiles === 0" class="file-picker__state">
          <p>{{ t.workspace.filePicker.empty }}</p>
        </div>
      </template>
    </div>

    <p class="file-picker__hint">{{ t.workspace.filePicker.hint }}</p>
  </div>
</template>

<style scoped>
/* 浮层:固定在视口坐标系里(页面级渲染,不在区域面板内 —— 区域有 container-type,
   会成为 fixed 后代的包含块)。圆角取面板 / 浮层档 xl,极轻阴影只承担「浮起来」这一层语义。 */
.file-picker {
  position: fixed;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
  box-shadow: var(--dl-shadow-lg);
  animation: file-picker-in var(--dl-duration-fast) var(--dl-ease-standard);
}

@keyframes file-picker-in {
  from { opacity: 0; transform: translateY(calc(-1 * var(--dl-space-1))); }
  to { opacity: 1; transform: none; }
}

/* 搜索区:与 ▾ 菜单里的搜索框同一套配方(同高、同描边、同焦点环落点)。 */
.file-picker__search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  margin: var(--dl-space-3) var(--dl-space-3) var(--dl-space-2);
  padding-inline: var(--dl-space-3);
  min-height: var(--dl-control-height);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-base);
}

.file-picker__search:focus-within {
  border-color: var(--dl-border-strong);
  box-shadow: var(--dl-focus-ring);
}

.file-picker__search-icon {
  flex-shrink: 0;
  color: var(--dl-text-secondary);
}

.file-picker__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--dl-text-primary);
  font: inherit;
}

/* 焦点环只留外层容器那一圈;输入框自身不再叠一层。 */
.file-picker__input:focus,
.file-picker__input:focus-visible {
  outline: none;
  box-shadow: none;
}

.file-picker__input::placeholder {
  color: var(--dl-text-secondary);
}

.file-picker__clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-lg);
  block-size: var(--dl-icon-lg);
  margin-inline-end: calc(-1 * var(--dl-space-1));
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-tight);
}

.file-picker__clear:hover { color: var(--dl-text-primary); }
.file-picker__clear:focus-visible { box-shadow: var(--dl-focus-ring); }

/* 滚动区:内容多时只滚这一块,搜索框与底部提示不动。 */
.file-picker__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--dl-space-2) var(--dl-space-2);
}

.file-picker__caption {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  padding: var(--dl-space-1) var(--dl-space-2);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-label);
}

.file-picker__caption-count {
  color: var(--dl-text-secondary);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.file-picker__list {
  display: grid;
  gap: 1px;
}

/* 行:密集列表档(32px),整行可点;缩进由 --picker-depth 线性展开。
   焦点环向外画,行本身不裁切。 */
.file-picker__row {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-height: var(--workspace-nav-control-size, 32px);
  padding-block: var(--dl-space-1);
  padding-inline: calc(var(--dl-space-2) + var(--picker-depth, 0) * var(--dl-space-4));
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  text-align: start;
  cursor: pointer;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-picker__row:hover { background: var(--dl-bg-hover); }
.file-picker__row:focus-visible { box-shadow: var(--dl-focus-ring); }
.file-picker__row[aria-selected='true'] { background: var(--dl-accent-soft); }

/* 项目根:比子项重一档,承担组头的角色(项目名是文字通道,色点是颜色通道)。 */
.file-picker__row--project {
  margin-block-start: var(--dl-space-1);
  color: var(--dl-text-primary);
  font-weight: 500;
}

.file-picker__dot {
  flex: none;
  inline-size: var(--dl-identity-dot-size);
  block-size: var(--dl-identity-dot-size);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-identity);
}

.file-picker__caret,
.file-picker__caret-slot {
  flex: none;
  inline-size: var(--dl-icon-sm);
  block-size: var(--dl-icon-sm);
  color: var(--dl-text-tertiary);
}

.file-picker__caret {
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-picker__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.file-picker__caret.is-open { transform: rotate(90deg); }

/* 文件行没有折叠箭头,用一枚同宽的占位保持名称列对齐。 */
.file-picker__caret-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.file-picker__file-icon {
  flex: none;
  color: var(--dl-text-tertiary);
}

.file-picker__body {
  display: grid;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.file-picker__name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dl-text-primary);
}

.file-picker__path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dl-text-tertiary);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
}

/* 项目行右侧的元信息:文件数 / 加载中 / 加载失败 · 重试。 */
.file-picker__meta {
  flex: none;
  margin-inline-start: auto;
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}

.file-picker__meta[data-error='true'] { color: var(--dl-warning); }

/* 搜索命中的高亮:只染文字底,不改字号 / 字重(避免行高跳动)。 */
.file-picker__name mark {
  border-radius: var(--dl-radius-sm);
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
}

/* 状态芯片:与文件树 / 文件栏同一套取值与配色。 */
.file-picker__chip {
  flex: none;
  padding: 0 var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.file-picker__chip[data-state='created'] { color: var(--dl-accent); }
.file-picker__chip[data-state='modified'] { color: var(--dl-warning); }
.file-picker__chip[data-state='pending'] { color: var(--dl-accent); border-color: var(--dl-accent); background: var(--dl-accent-soft); }

/* 加载 / 空 / 无结果:一句说明 + (可选)一个动作,不留白屏。 */
.file-picker__state {
  display: grid;
  justify-items: start;
  gap: var(--dl-space-2);
  padding: var(--dl-space-3) var(--dl-space-2);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
}

.file-picker__action {
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
}

.file-picker__action:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.file-picker__action:focus-visible { box-shadow: var(--dl-focus-ring); }

/* 底部提示:键盘通路写在界面上,而不是只藏在文档里。 */
.file-picker__hint {
  flex-shrink: 0;
  padding: var(--dl-space-2) var(--dl-space-3);
  border-block-start: var(--dl-border-width) solid var(--dl-border-base);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

@media (max-width: 560px) {
  .file-picker { width: calc(100vw - 2 * var(--dl-space-4)); }
}

@media (prefers-reduced-motion: reduce) {
  .file-picker { animation: none; }
  .file-picker__caret { transition: none; }
  .file-picker__row { transition: none; }
}
</style>
