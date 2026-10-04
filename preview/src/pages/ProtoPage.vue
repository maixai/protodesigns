<script setup lang="ts">
// 详情页:按 slug 展示对应原型的 iframe 预览;slug 不存在时显示未找到提示。
// 本组件只负责详情页壳(header + iframe 容器),iframe 内 proto 页面保持原样。
import { computed } from 'vue'
import { NButton, NEmpty } from 'naive-ui'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import BrandMark from '../components/BrandMark.vue'
import { getProto, isBuilt } from '../registry'

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

// 本次是否构建出了预览产物。未构建时必须**不给可打开的链接**:
// 静态服务对未知路径回退到预览站自己的 index.html,打开后是预览站 SPA 而非原型,
// 表现为一片空白。构建计划由 scripts/aggregate.mjs 产出。
const built = computed(() => slug.value !== undefined && isBuilt(slug.value))

// mobile 原型的产物依赖 Flutter SDK,未构建时原因基本就是本机没装,提示要说到点上。
const needsFlutter = computed(() => proto.value?.targets.includes('mobile') ?? false)

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
          <a v-if="built" class="proto-page__open" :href="iframeSrc" target="_blank" rel="noopener">
            在新标签打开
          </a>
        </div>
      </header>
      <main class="proto-page__main">
        <div v-if="built" class="proto-page__frame">
          <iframe class="proto-page__iframe" :src="iframeSrc" :title="proto.name" />
        </div>

        <div v-else class="proto-page__not-built">
          <p class="proto-page__not-built-title">该原型本次未构建出预览产物</p>
          <p class="proto-page__not-built-hint">
            <template v-if="needsFlutter">
              mobile 原型的预览由 Flutter Web 构建产出。本机未安装 Flutter SDK 时，
              <code>make build</code> 会跳过它；安装 Flutter SDK 后重跑 <code>make build</code> 即可。
            </template>
            <template v-else>
              该原型不在本次构建计划内，请重跑 <code>make build</code>。
            </template>
          </p>
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

/* 未构建时的说明区:替代 iframe,说清原因与恢复方式,不留空白 */
.proto-page__not-built {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  text-align: center;
}

.proto-page__not-built-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-heading);
  color: var(--color-text-strong);
}

.proto-page__not-built-hint {
  max-width: 44ch;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--text-sm--line);
  color: var(--color-text-secondary);
}

.proto-page__not-built-hint code {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-container);
  border: var(--border-width) solid var(--color-border-light);
  font-size: var(--font-size-xs);
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
