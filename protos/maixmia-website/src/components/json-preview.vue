<script setup lang="ts">
// JSON 预览:只读的结构视图 —— **折叠树**与**表格**(根为对象数组时的等价行视图)。
//
// 只读,且**值一律走 Vue 文本节点**(`{{ }}`)渲染 —— 本组件不产生任何 HTML,故不存在注入面,
// 也不走 markdown 那条 DOMPurify 管线(那条管线服务「要把 HTML 注入 DOM」的 markdown /
// mermaid / html 三档)。要改内容走「源码」档,与业界一致。
//
// 树的三条要点(与 json-tree-node.vue 共同保证):
//   · 可折叠;**折叠的枝不渲染后代**(性能关键);
//   · 值**按类型着色**(键 / 字符串 / 数字 / 布尔 / null 各不同,且颜色之外还有字形区分);
//   · 折叠节点显示计数(`{3}` / `[5]`);
//   · **默认展开到第 2 层**(JSON_DEFAULT_EXPAND_DEPTH),深层默认折叠 —— 大文件不卡的另一半。
//
// 表格模式(用户点名要的「把对象数组读成行」):列 = 各对象键的**并集**(按首次出现顺序),
// 行 = 各元素;嵌套值以紧凑 JSON 字符串呈现并由样式截断。
// **只在数据确实是非空对象数组时才出现**那一枚按钮 —— 否则不渲它(不摆一个点了没反应的死控件)。
//
// 工具条由**父组件以插槽给出**,而不是写在本地:
//   它的类名(.file-panel__subtools / .file-panel__view)属于 file-panel.vue 的 scoped 样式,
//   只有写在父模板里才拿得到那一套视觉(通栏 / 同源底色 / 下缘发丝线 / 吸顶)—— 这正是
//   「复用变更档那条面板式工具条」的要求。本组件只把**状态与动作**通过插槽 props 交出去。
import { computed, ref, watch } from 'vue'
import type { JsonTable, JsonTreeNode } from '../data/json-tree'
import { collectContainerIds, defaultExpandedIds, jsonTableOf, parseJsonDocument } from '../data/json-tree'
import { useI18n } from '../i18n'
import JsonTreeNodeView from './json-tree-node.vue'

const props = defineProps<{
  // 文件当前内容(与「源码」档共用同一份内存 source)。
  source: string
}>()

// 工具条插槽:父组件据这些 props 渲染「树 | 表格」与「全部展开 | 全部折叠」。
// 视图取值只在本组件与插槽之间流动,故不做模块级导出(父组件靠插槽类型自动推导)。
type JsonPreviewView = 'tree' | 'table'

defineSlots<{
  toolbar: (props: {
    view: JsonPreviewView
    // 有可展开的树(解析成功)。解析失败时**没有任何工具可用** —— 父组件据此整条不渲染,
    // 免得摆出一排点了没反应的死控件。
    canExpand: boolean
    canTable: boolean
    setView: (view: JsonPreviewView) => void
    expandAll: () => void
    collapseAll: () => void
  }) => unknown
}>()

const { t } = useI18n()

// 解析结果(源变化时重算一次)。视图 / 展开集按解析结果派生,故不必重复解析。
const parsed = computed(() => parseJsonDocument(props.source))
const root = computed<JsonTreeNode | null>(() => (parsed.value.ok ? parsed.value.root : null))
const table = computed<JsonTable | null>(() => (root.value === null ? null : jsonTableOf(root.value)))

const view = ref<JsonPreviewView>('tree')
const expanded = ref<ReadonlySet<string>>(new Set())

// 换文件 / 源码档改过再回来:视图回树、展开集回默认层 —— 都属「这一次看这份 JSON」。
// 注意这里**不重置源码之外的编辑**(本档只读,没有可重置的编辑)。
watch(() => props.source, () => {
  view.value = 'tree'
  const current = root.value
  expanded.value = current === null ? new Set() : defaultExpandedIds(current)
}, { immediate: true })

// 渲染模型:把「解析失败 / 没有表格可用」这些分支收在一个判别联合里,模板只需按 kind 分流。
type JsonPreviewModel =
  | { kind: 'error'; message: string }
  | { kind: 'tree'; root: JsonTreeNode }
  | { kind: 'table'; table: JsonTable }

const model = computed<JsonPreviewModel>(() => {
  const result = parsed.value
  if (!result.ok) return { kind: 'error', message: result.message }
  const currentTable = table.value
  if (view.value === 'table' && currentTable !== null) return { kind: 'table', table: currentTable }
  return { kind: 'tree', root: result.root }
})

function setView(next: JsonPreviewView): void {
  view.value = next
}

// 树节点的展开 / 收起:换一份新的 Set 以触发更新(Set 的就地改动不是响应式的)。
function toggleNode(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function expandAll(): void {
  const current = root.value
  expanded.value = current === null ? new Set() : new Set(collectContainerIds(current))
}

function collapseAll(): void {
  expanded.value = new Set()
}

const errorText = computed<string>(() => {
  const result = parsed.value
  return result.ok ? '' : t.value.workspace.filePanel.jsonError.replace('{message}', result.message)
})
</script>

<template>
  <slot
    name="toolbar"
    :view="view"
    :can-expand="model.kind !== 'error'"
    :can-table="table !== null"
    :set-view="setView"
    :expand-all="expandAll"
    :collapse-all="collapseAll"
  />

  <!-- 非法 JSON:一行可读的解析错误(含 JSON.parse 的原始信息)+ 一句指路。
       用 role="alert" 让读屏即时播报,**不白屏、不静默**。
       三个分支的根都带 `file-render` 这个**约定类**(预览档的「内容本体」统一挂它,见
       file-panel.vue),外部断言「这一档的内容在场」时只需认这一个类。 -->
  <div v-if="model.kind === 'error'" class="file-render file-render--json json-preview__error" role="alert">
    <p class="json-preview__error-message">{{ errorText }}</p>
    <p class="json-preview__error-hint">{{ t.workspace.filePanel.jsonErrorHint }}</p>
  </div>

  <!-- 树:根节点也是一个节点(它没有键名,只显示括号与计数)。 -->
  <ul
    v-else-if="model.kind === 'tree'"
    class="file-render file-render--json json-preview__tree json-tree"
    :aria-label="t.workspace.filePanel.jsonTreeLabel"
  >
    <JsonTreeNodeView :node="model.root" :expanded="expanded" @toggle="toggleNode" />
  </ul>

  <!-- 表格:对象数组的等价行视图。列是各对象键的并集,行是各元素。 -->
  <table v-else class="file-render file-render--json json-preview__table" :aria-label="t.workspace.filePanel.jsonTableLabel">
    <thead>
      <tr>
        <th scope="col" class="json-preview__rownum" :aria-label="t.workspace.filePanel.rowNumber"></th>
        <th v-for="column in model.table.columns" :key="column" scope="col" class="json-preview__cell">{{ column }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in model.table.rows" :key="row.id">
        <th scope="row" class="json-preview__rownum">{{ index + 1 }}</th>
        <td
          v-for="(cell, column) in row.cells"
          :key="column"
          class="json-preview__cell"
          :data-nested="cell.nested ? 'true' : 'false'"
          :title="cell.nested ? cell.text : undefined"
        >{{ cell.text }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
/* 树与表格共用的容器内缩:左缘与消息正文同轴(侧向 gutter),等宽字体承担技术信息。 */
.json-preview__tree,
.json-preview__table {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.json-preview__tree {
  padding: var(--dl-space-2) var(--workspace-gutter) var(--dl-space-6);
  list-style: none;
  margin: 0;
}

.json-preview__table {
  display: block;
  inline-size: max-content;
  min-inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.json-preview__table thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--dl-z-sticky);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-secondary);
  font-weight: 500;
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}

.json-preview__table tbody th,
.json-preview__table tbody td {
  border-block-end: var(--dl-border-width) solid var(--dl-border-subtle);
}

/* 单元格:嵌套值的紧凑 JSON 很长,故封一个上限并截断;全文留在 title 里(悬停可读),
   也留在 DOM 文本里。文本列一律左对齐(键与值的可比性靠行,不靠居中)。 */
.json-preview__cell {
  max-inline-size: 20em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: var(--dl-space-1) var(--dl-space-3);
  text-align: start;
  color: var(--dl-text-primary);
}

/* 嵌套值的单元格用三级文字色区分「这里是一段被压扁的 JSON」,与标量格在灰度下也分得开。 */
.json-preview__cell[data-nested='true'] {
  color: var(--dl-text-secondary);
}

.json-preview__rownum {
  inline-size: 1%;
  padding: var(--dl-space-1) var(--dl-space-3) var(--dl-space-1) var(--workspace-gutter);
  text-align: end;
  color: var(--dl-text-tertiary);
  font-weight: 400;
  white-space: nowrap;
  border-inline-end: var(--dl-border-width) solid var(--dl-border-base);
}

.json-preview__table tbody tr:hover .json-preview__cell,
.json-preview__table tbody tr:hover .json-preview__rownum {
  background: var(--dl-bg-hover);
}

.json-preview__error {
  display: grid;
  gap: var(--dl-space-2);
  padding: var(--dl-space-6) var(--workspace-gutter);
}

.json-preview__error-message {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-error);
}

.json-preview__error-hint {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}
</style>
