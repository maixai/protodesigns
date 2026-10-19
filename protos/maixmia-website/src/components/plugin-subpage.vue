<script setup lang="ts">
// 插件页的子页面外壳:明确的返回按钮 + 面包屑 + 当前页标题。
//
// 子页面在同一个 Agent 设置面板内切换(滑动过渡),不另开弹层;层级再深时,
// crumb 列表就是路径来源,返回按钮永远回到上一级。
import { ref } from 'vue'
import DliIcon from './dl-icon.vue'

export interface PluginCrumb {
  key: string
  label: string
}

defineProps<{
  title: string
  hint?: string
  crumbs: readonly PluginCrumb[]
  backLabel: string
  breadcrumbLabel: string
}>()

const emit = defineEmits<{
  back: []
  navigate: [key: string]
}>()

const backRef = ref<HTMLButtonElement | null>(null)
defineExpose({ focusBack: () => backRef.value?.focus() })
</script>

<template>
  <div class="plugin-subpage">
    <div class="subpage__head">
      <div class="subpage__nav">
        <button ref="backRef" type="button" class="subpage__back" @click="emit('back')">
          <DliIcon name="chevronLeft" size="sm" />
          <span>{{ backLabel }}</span>
        </button>
        <nav class="subpage__crumbs" :aria-label="breadcrumbLabel">
          <template v-for="(crumb, index) in crumbs" :key="crumb.key">
            <button type="button" class="subpage__crumb" @click="emit('navigate', crumb.key)">{{ crumb.label }}</button>
            <span v-if="index < crumbs.length - 1" class="subpage__sep" aria-hidden="true">/</span>
          </template>
        </nav>
      </div>
      <h3 class="subpage__title">{{ title }}</h3>
      <p v-if="hint !== undefined && hint !== ''" class="subpage__hint">{{ hint }}</p>
    </div>
    <div class="subpage__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.plugin-subpage { display: grid; gap: var(--dl-space-3); min-width: 0; }

/* 吸顶:内容再长,返回与路径也保持在视野内。 */
.subpage__head { position: sticky; inset-block-start: 0; z-index: var(--dl-z-sticky); display: grid; gap: var(--dl-space-1); padding-block: var(--dl-space-2) var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-base); background: var(--dl-bg-elevated); }
.subpage__nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2); min-width: 0; }

.subpage__back { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-control-height); margin-inline-start: calc(-1 * var(--dl-space-2)); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.subpage__back:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.subpage__back:focus-visible { box-shadow: var(--dl-focus-ring); }

.subpage__crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); min-width: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.subpage__crumb { min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.subpage__crumb:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.subpage__crumb:focus-visible { box-shadow: var(--dl-focus-ring); }
.subpage__sep { color: var(--dl-border-strong); }

.subpage__title { color: var(--dl-text-primary); font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-snug); }
.subpage__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.subpage__body { min-width: 0; }
</style>
