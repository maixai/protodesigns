<script setup lang="ts">
// 卡片组件:props 驱动渲染单个原型卡片,整卡为主点击目标跳转详情页。
// 顶部为基于 slug 确定性生成的几何视觉锚点区 + mono slug 标签;中部为标题/描述/meta 三级文字层级。
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { ProtoMeta } from '../types'
import { parseUpdatedAt, isUpdatedToday } from '../registry'

defineOptions({ name: 'ProtoCard' })

interface ProtoCardProps {
  proto: ProtoMeta
}

const props = defineProps<ProtoCardProps>()
const router = useRouter()

// 是否属于"今日更新":由 updated_at 是否落在浏览器本地时区的今天决定,驱动 badge 渲染与布局预留。
const isToday = isUpdatedToday(props.proto.updated_at)

// 点击整卡跳转到详情页。
function goToProto(): void {
  router.push(`/proto/${props.proto.slug}`)
}

// 键盘操作整卡(Enter/Space)跳转;仅当焦点在卡片本体时生效,避免拦截内部链接的键盘事件。
function handleCardKeydown(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    goToProto()
  }
}

// 绝对时间格式化器:输出形如 2026-08-29 17:56。
const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

// 把 updated_at 字符串格式化为绝对时间展示;解析失败时回退显示原始字符串。
function formatUpdatedAt(updatedAt: string): string {
  const time = parseUpdatedAt(updatedAt)
  if (Number.isNaN(time)) return updatedAt
  return dateTimeFormatter.format(new Date(time))
}

// 生成机器可读的 ISO 时间,供 time 元素的 datetime 属性使用。
function isoDateTime(updatedAt: string): string {
  const time = parseUpdatedAt(updatedAt)
  if (Number.isNaN(time)) return updatedAt
  return new Date(time).toISOString()
}

// 依据 slug 计算确定性哈希(无随机),同一 slug 恒为固定值,供几何装饰取宽度。
function hashSlug(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  return hash
}

// 视觉锚点区的两条几何横线宽度:宽线 20%–48%,窄线约为宽线的 55% 并叠加低阶位微调,总和不超过容器。
const anchorWidths = computed(() => {
  const hash = hashSlug(props.proto.slug)
  const wide = 20 + (hash % 29)
  const narrow = Math.min(40, Math.round(wide * 0.55) + ((hash >>> 4) % 5))
  return { wide, narrow }
})
</script>

<template>
  <article
    class="proto-card"
    :class="{ 'proto-card--today': isToday }"
    tabindex="0"
    @click="goToProto"
    @keydown="handleCardKeydown"
  >
    <span v-if="isToday" class="proto-card__today-badge">
      <span class="proto-card__today-dot" aria-hidden="true" />
      今日更新
    </span>
    <div class="proto-card__anchor" aria-hidden="true">
      <div class="proto-card__anchor-bars">
        <span
          class="proto-card__anchor-bar proto-card__anchor-bar--wide"
          :style="{ width: `${anchorWidths.wide}%` }"
        />
        <span
          class="proto-card__anchor-bar proto-card__anchor-bar--narrow"
          :style="{ width: `${anchorWidths.narrow}%` }"
        />
      </div>
    </div>

    <h2 class="proto-card__name">
      <RouterLink :to="`/proto/${proto.slug}`" class="proto-card__name-link" @click.stop>
        {{ proto.name }}
      </RouterLink>
    </h2>
    <p class="proto-card__description">{{ proto.description }}</p>

    <dl class="proto-card__meta">
      <div class="proto-card__meta-row">
        <dt>Targets</dt>
        <dd>{{ proto.targets.join(' / ') }}</dd>
      </div>
      <div class="proto-card__meta-row">
        <dt>Data</dt>
        <dd>{{ proto.data }}</dd>
      </div>
      <div class="proto-card__meta-row">
        <dt>Owner</dt>
        <dd>{{ proto.owner }}</dd>
      </div>
      <div class="proto-card__meta-row">
        <dt>Email</dt>
        <dd>
          <a class="proto-card__email" :href="`mailto:${proto.owner_email}`" @click.stop>
            {{ proto.owner_email }}
          </a>
        </dd>
      </div>
      <div class="proto-card__meta-row">
        <dt>Updated</dt>
        <dd>
          <time :datetime="isoDateTime(proto.updated_at)">
            {{ formatUpdatedAt(proto.updated_at) }}
          </time>
        </dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.proto-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-container);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--easing-base),
    box-shadow var(--duration-fast) var(--easing-base),
    transform var(--duration-fast) var(--easing-base);
}

/* hover:边框转强调色 + 阴影提升 + 轻微上浮 */
.proto-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

/* active:按压回弹,阴影回落到基础档 */
.proto-card:active {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(0);
}

/* 焦点可见:整卡自聚焦或内部链接聚焦时均显示轮廓 */
.proto-card:focus-within,
.proto-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* 减少动效偏好下禁用位移与过渡 */
@media (prefers-reduced-motion: reduce) {
  .proto-card {
    transition: none;
  }

  .proto-card:hover {
    transform: none;
  }
}

/* 今日更新 badge:绝对定位卡片右上角,墨绿系 pill,前置同色系圆点标记 */
.proto-card__today-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  background-color: var(--color-primary-50);
  color: var(--color-primary-700);
  font-size: var(--text-xs);
  line-height: var(--text-xs--line);
  font-weight: var(--font-weight-medium);
}

/* badge 圆点:6px 几何标记(非 emoji),用间距 token 相减得到精确尺寸,避免硬编码数值 */
.proto-card__today-dot {
  width: calc(var(--space-2) - var(--space-0\.5));
  height: calc(var(--space-2) - var(--space-0\.5));
  border-radius: var(--radius-full);
  background-color: var(--color-primary-500);
}

/* 顶部视觉锚点区:几何横线 + mono slug 标签 */
.proto-card__anchor {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.proto-card__anchor-bars {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.proto-card__anchor-bar {
  display: block;
  border-radius: var(--radius-xs);
}

/* 宽横线:强调色主条 */
.proto-card__anchor-bar--wide {
  height: var(--space-1);
  background-color: var(--color-primary-500);
}

/* 窄横线:浅一阶的辅助条,与宽线形成主次对比 */
.proto-card__anchor-bar--narrow {
  height: var(--space-0\.5);
  background-color: var(--color-primary-300);
}

/* 标题:Sans semibold */
.proto-card__name {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-heading);
}

.proto-card__name-link {
  color: var(--color-text-strong);
  text-decoration: none;
  transition: color var(--duration-fast) var(--easing-base);
}

.proto-card__name-link:hover {
  color: var(--color-primary);
}

.proto-card__name-link:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 描述:固定两行截断,flex:1 让 meta 行在卡片间底部对齐 */
.proto-card__description {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--text-sm--line);
  color: var(--color-text-normal);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

/* meta 行:顶部细分隔线与内容区分,xs 弱化 */
.proto-card__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding-top: var(--space-3);
  border-top: var(--border-width) solid var(--color-border-light);
}

.proto-card__meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  line-height: var(--text-xs--line);
}

.proto-card__meta dt {
  color: var(--color-text-secondary);
}

.proto-card__meta dd {
  margin: 0;
  color: var(--color-text-normal);
  text-align: right;
  overflow-wrap: anywhere;
}

.proto-card__email {
  color: var(--color-primary);
  text-decoration: none;
  transition: color var(--duration-fast) var(--easing-base);
}

.proto-card__email:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
}

.proto-card__email:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
</style>
