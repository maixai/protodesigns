<script setup lang="ts">
// JSON 树的一个节点(自引用组件,靠文件名递归 —— 见 defineOptions 的 name)。
//
// 三条实现要点:
//   · **折叠的枝不渲染后代**:容器未展开时,连承载子节点的 `<ul>` 都不创建 —— 大文件里
//     一个收起的枝下**一个 DOM 节点都不会生成**。这是性能的关键(不折叠会把 DOM 撑爆),
//     而不是「渲染出来再藏起来」。
//   · **值按类型着色**:种类写在 `data-type` 上、颜色由样式按种类给(class 与颜色分离,
//     便于测试断言「各类值的类/属性不同」,也让颜色可以整体替换而不动结构)。
//     颜色之外还有**字形**上的区分(字符串带引号、布尔是 true/false、null 是字面量),
//     故不违反 WCAG 1.4.1(信息不得只靠颜色传达)。
//   · **展开钮是原生 `<button aria-expanded>`**:Tab 可达、Enter / Space 可触发、状态可读;
//     图标纯装饰(aria-hidden),可访问名由 aria-label 给出(含键名)。
import { computed } from 'vue'
import type { JsonTreeNode } from '../data/json-tree'
import { useI18n } from '../i18n'

defineOptions({ name: 'JsonTreeNode' })

const props = defineProps<{
  node: JsonTreeNode
  // 展开集(只读):由 json-preview 持有,这里只读它决定「自己这一枝要不要展开」。
  expanded: ReadonlySet<string>
}>()

const emit = defineEmits<{ toggle: [id: string] }>()

const { t } = useI18n()

const isExpanded = computed<boolean>(() => props.expanded.has(props.node.id))
// 展开钮的可访问名:动作 + 对象。根节点没有键名,故用「根节点」兜底。
const toggleLabel = computed<string>(() => {
  const name = props.node.key === '' ? t.value.workspace.filePanel.jsonRootLabel : props.node.key
  const template = isExpanded.value ? t.value.workspace.filePanel.jsonCollapseNode : t.value.workspace.filePanel.jsonExpandNode
  return template.replace('{key}', name)
})

// 容器的开闭括号:对象 {} / 数组 []。计数写在两者之间(折叠时这就是全部可见的信息)。
const openBrace = computed<string>(() => (props.node.kind === 'array' ? '[' : '{'))
const closeBrace = computed<string>(() => (props.node.kind === 'array' ? ']' : '}'))

function onToggle(): void {
  emit('toggle', props.node.id)
}
</script>

<template>
  <li class="json-tree__row" :data-kind="node.kind" :data-depth="node.depth" :data-node-id="node.id">
    <!-- 叶节点没有展开钮,但保留同宽的占位,让键名逐层左对齐(不靠负外边距硬凑)。 -->
    <button
      v-if="node.isContainer"
      type="button"
      class="json-tree__toggle"
      :aria-expanded="isExpanded"
      :aria-label="toggleLabel"
      @click="onToggle"
    ><span aria-hidden="true" class="json-tree__caret">{{ isExpanded ? '▾' : '▸' }}</span></button>
    <span v-else class="json-tree__toggle json-tree__toggle--leaf" aria-hidden="true"></span>

    <span v-if="node.key !== ''" class="json-tree__key">{{ node.key }}</span><span v-if="node.key !== ''" class="json-tree__punct" aria-hidden="true">:</span>

    <!-- 容器:显示开括号 + 子节点计数 + 闭括号。计数对折叠态是「这一枝里有多少东西」,
         对展开态是「这一层有多少项」,两种状态下都成立,故一律显示。 -->
    <template v-if="node.isContainer">
      <span class="json-tree__punct" aria-hidden="true">{{ openBrace }}</span>
      <span class="json-tree__count">{{ node.size }}</span>
      <span class="json-tree__punct" aria-hidden="true">{{ closeBrace }}</span>
    </template>
    <span v-else class="json-tree__value" :data-type="node.kind">{{ node.literal }}</span>
  </li>

  <!-- 子节点:只有展开时才创建这棵子树(折叠的枝一个后代都不渲染)。 -->
  <li v-if="node.isContainer && isExpanded && node.children.length > 0" class="json-tree__children">
    <ul class="json-tree">
      <JsonTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :expanded="expanded"
        @toggle="onToggle"
      />
    </ul>
  </li>
</template>

<style scoped>
.json-tree {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* 每一层缩进一档:缩进落在**子节点的列表**上(而不是每行按深度补内边距),
   于是层级由 DOM 结构表达,不需要给每个行挂一个动态缩进值。 */
.json-tree__children {
  list-style: none;
  padding-inline-start: var(--dl-space-4);
}

.json-tree__row {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-1);
  min-block-size: var(--dl-line-snug);
}

/* 展开钮:密集行内的控件(树行),走收窄那一档;整行不参与命中,故只给按钮本身。 */
.json-tree__toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-md);
  block-size: var(--dl-icon-md);
  align-self: flex-start;
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
}

.json-tree__toggle:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.json-tree__toggle:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.json-tree__caret {
  line-height: 1;
}

/* 键:二级文字色 —— 与各类型值的颜色都不同,且与「值」在层级上有区分。 */
.json-tree__key {
  color: var(--dl-text-secondary);
}

.json-tree__punct,
.json-tree__count {
  color: var(--dl-text-tertiary);
}

/* 值的类型着色。**颜色全部取语义角色 token**(不引 ramp 阶),且每一对都实测过:
   本面板的底色是 --dl-bg-elevated,下述任一颜色在它上面的对比度都 ≥ 4.5:1(浅 / 深两套)。
   改这些取值必须重跑对比度断言(同理,三级文字色压在 hover 底上曾实测只有 4.41:1,不可复用)。 */
.json-tree__value[data-type='string'] {
  color: var(--dl-success);
}

.json-tree__value[data-type='number'] {
  color: var(--dl-highlight);
}

.json-tree__value[data-type='boolean'] {
  color: var(--dl-info);
}

.json-tree__value[data-type='null'] {
  color: var(--dl-text-tertiary);
}
</style>
