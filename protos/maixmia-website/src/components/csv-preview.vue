<script setup lang="ts">
// CSV 预览:把一份分隔符文本渲染成**只读的数据表格**。
//
// 只读,且**值一律走 Vue 文本节点**(`{{ }}`)渲染 —— 本组件不产生任何 HTML,故不存在
// 注入面,也就不走 markdown 那条 DOMPurify 管线(那条管线服务的是「要把 HTML 注入 DOM」的
// markdown / mermaid / html 三种 kind)。这是两类预览与本面板其余档位的分工边界:
//   · 走 v-html 的:markdown(渲染 + 清洗)、mermaid(二次清洗)、html(不注入本页,走 sandbox iframe);
//   · 只走文本节点的:本组件与 json-preview —— 它们的输入是数据,不是标记,天然没有注入面。
// 编辑一律回「源码」档(与业界一致)。
//
// 表格口径(调研结论,GitHub 的 CSV 渲染 + 表格 UX 通则):
//   · **首行即表头**,`<th scope="col">`;**行号**列用 `<th scope="row">`;
//   · **粘性表头** —— 长表纵向滚动时表头不跟着跑掉;
//   · 宽表**横向可滚**且不撑破面板(表格按内容宽出,面板体自身的横向滚动条接管);
//   · **文本列左对齐、数字列右对齐**(按列判定,见 data/csv.ts),表头与列内容同向,**永不居中**;
//   · 数字列走 `tabular-nums`(角色层已全局继承等宽数字),列宽不因数值变化而跳动;
//   · 单元格过长时截断(不在面板里撑出一条无限长的列),全文仍留在 DOM 文本里;
//   · 超过行数上限时只渲前 N 行,并在表下**明写**一句说明(不静默截断)。
import { computed } from 'vue'
import { parseTable, type CsvTable } from '../data/csv'
import { useI18n } from '../i18n'

const props = defineProps<{
  // 文件当前内容(与「源码」档共用同一份内存 source)。
  source: string
}>()

const { t } = useI18n()
const table = computed<CsvTable>(() => parseTable(props.source))

const truncatedNote = computed<string>(() =>
  t.value.workspace.filePanel.csvTruncated
    .replace('{shown}', String(table.value.rows.length))
    .replace('{total}', String(table.value.totalRows)))
</script>

<template>
  <!-- 根元素带上 `file-render` 这个**约定类**:预览档的「内容本体」统一挂它(image / markdown /
       html 三种都在用,见 file-panel.vue),外部断言「这一档的内容在场」时只需认这一个类。 -->
  <div class="file-render file-render--csv csv-preview">
    <!-- 空表:有内容但解析不出一列(空文件 / 只有一行分隔符)。给一句说明,不白屏。 -->
    <p v-if="table.columnCount === 0" class="csv-preview__empty">{{ t.workspace.filePanel.csvEmpty }}</p>
    <template v-else>
      <!-- 表格的可访问名由 aria-label 承担(不与可见文案重复)。 -->
      <table class="csv-preview__table" :aria-label="t.workspace.filePanel.csvTableLabel">
        <thead>
          <tr>
            <!-- 行号列的角格:内容为空,靠 aria-label 说出它是「行号」列(空的 th 不可能是
                 只有装饰,它对读屏是一列的表头)。 -->
            <th scope="col" class="csv-preview__rownum" :aria-label="t.workspace.filePanel.rowNumber"></th>
            <th
              v-for="(header, column) in table.headers"
              :key="column"
              scope="col"
              class="csv-preview__cell"
              :data-col="column"
              :data-align="table.aligns[column] ?? 'start'"
            >{{ header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in table.rows" :key="index">
            <!-- 行号 = **数据行的序号**(表头不计入,故从 1 起)—— 它回答的是「这是第几条记录」,
                 而不是源文件的行号(源文件里第 i 条记录落在第 i+1 行)。 -->
            <th scope="row" class="csv-preview__rownum">{{ index + 1 }}</th>
            <td
              v-for="(cell, column) in row"
              :key="column"
              class="csv-preview__cell"
              :data-col="column"
              :data-align="table.aligns[column] ?? 'start'"
            >{{ cell }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="table.truncated" class="csv-preview__note" role="note">{{ truncatedNote }}</p>
    </template>
  </div>
</template>

<style scoped>
/* 表格按**内容宽**出(inline-size: max-content)并至少占满容器(min-inline-size: 100%):
   宽表因此横向滚动、窄表不缩成一个窄条。横向滚动交给面板体(它本就是滚动容器),
   本组件不另起一层滚动 —— 多一层就会把粘性表头的参照系从面板体挪到这一层。 */
.csv-preview__table {
  display: block;
  inline-size: max-content;
  min-inline-size: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

/* 粘性表头:面板体纵向滚动时表头留在顶部。底色必须**不透明**且与「面」同源,
   否则正文会从表头下面透出来。 */
.csv-preview__table thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--dl-z-sticky);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-secondary);
  font-weight: 500;
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}

.csv-preview__table tbody th,
.csv-preview__table tbody td {
  border-block-end: var(--dl-border-width) solid var(--dl-border-subtle);
}

/* 单元格:左对齐为默认,`[data-align='end']` 的列(数值列)右对齐。
   表头 cells 与数据 cells 走同一套对齐规则 —— 表头与列内容必须同向,永不居中。 */
.csv-preview__cell {
  max-inline-size: 20em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: var(--dl-space-1) var(--dl-space-3);
  text-align: start;
  color: var(--dl-text-primary);
}

.csv-preview__cell[data-align='end'] {
  text-align: end;
}

/* 行号列:窄、不参与截断、数字等宽,与内容列之间用一条更实的竖线分开。 */
.csv-preview__rownum {
  inline-size: 1%;
  padding: var(--dl-space-1) var(--dl-space-3) var(--dl-space-1) var(--workspace-gutter);
  text-align: end;
  color: var(--dl-text-tertiary);
  font-weight: 400;
  white-space: nowrap;
  border-inline-end: var(--dl-border-width) solid var(--dl-border-base);
}

.csv-preview__table thead .csv-preview__rownum {
  padding-inline-start: var(--workspace-gutter);
}

.csv-preview__table tbody tr:hover .csv-preview__cell,
.csv-preview__table tbody tr:hover .csv-preview__rownum {
  background: var(--dl-bg-hover);
}

/* 截断说明:与表格同宽的一条,不吸顶(它属于「这张表」的脚注)。 */
.csv-preview__note {
  padding: var(--dl-space-3) var(--workspace-gutter);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.csv-preview__empty {
  padding: var(--dl-space-6) var(--workspace-gutter);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}
</style>
