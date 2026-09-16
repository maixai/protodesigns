<script setup lang="ts">
// 详情页:按 slug 展示对应原型的 iframe 预览;slug 不存在时显示未找到提示。
// 本组件只负责详情页壳(header + iframe 容器),iframe 内 proto 页面保持原样。
import { computed } from 'vue'
import { NButton, NEmpty } from 'naive-ui'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BrandMark from '../components/BrandMark.vue'
import { getProto } from '../registry'

const route = useRoute()
const router = useRouter()

// slug 可能为字符串或数组(重复参数),仅接受单个字符串。
const slug = computed(() => {
  const raw = route.params.slug
  return typeof raw === 'string' ? raw : undefined
})

// 查 registry;未知 slug 时为 undefined,进入未找到分支。
const proto = computed(() => (slug.value === undefined ? undefined : getProto(slug.value)))
const iframeSrc = computed(() => (slug.value === undefined ? '' : `/p/${slug.value}/`))

// 返回首页。
function goBackHome(): void {
  router.push('/')
}
</script>

<template>
  <div class="proto-page">
    <template v-if="proto !== undefined">
      <header class="proto-page__header">
        <div class="proto-page__identity">
          <BrandMark class="proto-page__mark" :size="24" />
          <h1 class="proto-page__title">
            <RouterLink to="/" class="proto-page__crumb-home">Protodesigns Preview</RouterLink>
            <span class="proto-page__crumb-sep" aria-hidden="true"> / </span>
            <span class="proto-page__crumb-current">{{ proto.name }}</span>
          </h1>
        </div>
        <div class="proto-page__actions">
          <RouterLink to="/" class="proto-page__back">← 返回首页</RouterLink>
          <a class="proto-page__open" :href="iframeSrc" target="_blank" rel="noopener">
            在新标签打开
          </a>
        </div>
      </header>
      <main class="proto-page__main">
        <div class="proto-page__frame">
          <iframe class="proto-page__iframe" :src="iframeSrc" :title="proto.name" />
        </div>
      </main>
    </template>

    <div v-else class="proto-page__not-found">
      <NEmpty description="未找到该原型">
        <template #extra>
          <NButton type="primary" @click="goBackHome">返回首页</NButton>
        </template>
      </NEmpty>
    </div>
  </div>
</template>

<style scoped>
.proto-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-base);
}

/* 页头:左侧占位 mark + 原型名,右侧操作区,与首页 hero 同源视觉 */
.proto-page__header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border-bottom: var(--border-width) solid var(--border-base);
  background-color: var(--bg-base);
}

/* 左侧身份区:flex:1 + min-width:0,让长原型名可单行省略 */
.proto-page__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.proto-page__mark {
  color: var(--color-primary);
  flex-shrink: 0;
}

/* 面包屑标题:站点「Protodesigns Preview」(可点击回首页) / 当前原型名。
   serif 呼应首页 hero 视觉时刻;home 与分隔符固定,当前原型名超长单行截断。 */
.proto-page__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  line-height: var(--text-xl--line);
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
  white-space: nowrap;
}

.proto-page__crumb-home {
  flex-shrink: 0;
  color: var(--color-primary);
  text-decoration: none;
  transition: color var(--duration-fast) var(--easing-base);
}

.proto-page__crumb-home:hover {
  color: var(--color-primary-hover);
}

.proto-page__crumb-home:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.proto-page__crumb-sep {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.proto-page__crumb-current {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 平板起面包屑升档,呼应首页 hero 标题的断点升档 */
@media (min-width: 768px) {
  .proto-page__title {
    font-size: var(--text-2xl);
    line-height: var(--text-2xl--line);
  }
}

/* 右侧操作区:返回 + 新标签打开,固定不换行 */
.proto-page__actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
  white-space: nowrap;
}

.proto-page__back,
.proto-page__open {
  font-size: var(--font-size-sm);
  line-height: var(--text-sm--line);
  color: var(--color-primary);
  text-decoration: none;
  transition: color var(--duration-fast) var(--easing-base);
}

.proto-page__back:hover,
.proto-page__open:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.proto-page__back:focus-visible,
.proto-page__open:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 内容区:撑满剩余高度,背景用 overlay 色让白色 iframe 容器浮出 */
.proto-page__main {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: var(--space-4) var(--space-6);
  background-color: var(--bg-overlay);
}

/* iframe 容器:1px 边框 + 圆角包裹,内部元素随容器裁角 */
.proto-page__frame {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-container);
  overflow: hidden;
}

.proto-page__iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
}

/* 未找到态:与首页 empty 态一致,垂直水平居中 */
.proto-page__not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
}

/* 减少动效偏好下禁用非必要过渡 */
@media (prefers-reduced-motion: reduce) {
  .proto-page__back,
  .proto-page__open {
    transition: none;
  }
}
</style>
