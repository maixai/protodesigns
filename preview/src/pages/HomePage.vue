<script setup lang="ts">
// 首页:紧凑顶栏 + 实时搜索栏 + 卡片墙。卡片墙遍历渲染 ProtoCard 组件。
// 数据为构建期静态 registry,无异步请求,因此只覆盖「有数据」「搜索空结果」「无 proto」三态,无需 loading/error。
import { computed, ref } from 'vue'
import { NEmpty } from 'naive-ui'
import BrandMark from '../components/BrandMark.vue'
import ProtoCard from '../components/ProtoCard.vue'
import { getProtos } from '../registry'

// registry 已按 updated_at 倒序,作为过滤的只读数据源,不原地修改。
const protos = getProtos()
const hasProtos = protos.length > 0

// 搜索关键词,实时过滤(无防抖),仅在原型存在时才有意义。
const query = ref('')

// 基于关键词在 name / description / slug 三字段上做大小写不敏感子串匹配;
// 无关键词时返回全量,过滤沿用 registry 原有倒序,不重排。
const filteredProtos = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return protos
  return protos.filter(
    (proto) =>
      proto.name.toLowerCase().includes(keyword) ||
      proto.description.toLowerCase().includes(keyword) ||
      proto.slug.toLowerCase().includes(keyword),
  )
})

// 清空搜索词,供搜索栏清空按钮与空结果态操作复用。
function resetQuery(): void {
  query.value = ''
}
</script>

<template>
  <div class="home-page">
    <header class="topbar" aria-labelledby="topbar-title">
      <div class="topbar__identity">
        <BrandMark class="topbar__mark" :size="20" />
        <h1 id="topbar-title" class="topbar__title">Protodesigns Preview</h1>
      </div>
      <div class="topbar__meta">
        <p class="topbar__count">
          {{ filteredProtos.length }}
          {{ filteredProtos.length === 1 ? 'Preview' : 'Previews' }}
        </p>
      </div>
    </header>

    <template v-if="hasProtos">
      <!-- 独立一行搜索栏,与卡片网格同宽居中 -->
      <div class="search-bar">
        <form role="search" class="search-bar__field" @submit.prevent>
          <svg
            class="search-bar__icon"
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5" />
            <line
              x1="10.5"
              y1="10.5"
              x2="14"
              y2="14"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <input
            v-model="query"
            type="search"
            name="q"
            class="search-bar__input"
            placeholder="Search previews…"
            autocomplete="off"
            aria-label="搜索原型"
          />
          <button
            v-if="query.length > 0"
            type="button"
            class="search-bar__clear"
            aria-label="清空搜索"
            @click="resetQuery"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <line
                x1="3"
                y1="3"
                x2="9"
                y2="9"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <line
                x1="9"
                y1="3"
                x2="3"
                y2="9"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </form>
      </div>

      <main v-if="filteredProtos.length > 0" class="proto-grid" aria-label="原型卡片列表">
        <ProtoCard v-for="proto in filteredProtos" :key="proto.slug" :proto="proto" />
      </main>

      <!-- 搜索无匹配结果空态,区别于全站无 proto 空态 -->
      <div v-else class="search-empty" role="status">
        <p class="search-empty__title">未找到匹配的原型</p>
        <p class="search-empty__hint">尝试调整关键词或清空搜索</p>
        <button type="button" class="search-empty__action" @click="resetQuery">
          清空搜索
        </button>
      </div>
    </template>

    <div v-else class="proto-empty">
      <NEmpty description="暂无可用原型,请先在 protos/ 下补充原型后再运行聚合脚本" />
    </div>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
}

/* 紧凑顶栏:占位 mark + 标题居左,计数居右,1px 底边框分隔 */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 56px;
  padding: 0 var(--space-6);
  background-color: var(--bg-base);
  border-bottom: var(--border-width) solid var(--border-base);
}

/* 左侧身份区:flex:1 + min-width:0,让长标题可单行省略 */
.topbar__identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.topbar__mark {
  color: var(--color-primary);
  flex-shrink: 0;
}

/* 标题:serif 属「产品名展示位」,超长单行截断防溢出 */
.topbar__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-serif);
  font-size: var(--text-xl);
  line-height: var(--text-xl--line);
  font-weight: var(--font-weight-regular);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 右侧 meta 区:计数固定不换行 */
.topbar__meta {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.topbar__count {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  line-height: var(--text-xs--line);
  letter-spacing: 0.08em;
  color: var(--color-primary);
  white-space: nowrap;
}

/* 移动端:顶栏降档,仅保留标题 + 计数,避免窄屏拥挤 */
@media (max-width: 767px) {
  .topbar {
    min-height: 48px;
  }

  .topbar__title {
    font-size: var(--text-base);
    line-height: var(--text-base--line);
  }
}

/* 搜索栏:与卡片网格同宽居中,上下留白分隔顶栏与卡片墙 */
.search-bar {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6) 0;
}

/* 搜索字段本体:放大镜图标 + 输入框 + 清空按钮一行排布 */
.search-bar__field {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--space-10);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-elevated);
  border: var(--border-width) solid var(--border-base);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) var(--ease-standard);
}

/* hover:边框转强调色 */
.search-bar__field:hover {
  border-color: var(--color-primary);
}

/* 焦点落在输入框时,整条字段显示强调色轮廓 */
.search-bar__field:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* 放大镜图标:装饰性,弱化显示 */
.search-bar__icon {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.search-bar__input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--text-base--line);
  color: var(--text-primary);
}

.search-bar__input::placeholder {
  color: var(--text-tertiary);
}

.search-bar__input:focus {
  outline: none;
}

/* 隐藏原生 search 自带的取消按钮,避免与自定义清空按钮重复 */
.search-bar__input::-webkit-search-cancel-button {
  display: none;
}

/* 清空按钮:非空时出现的图标按钮 */
.search-bar__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-5);
  height: var(--space-5);
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}

.search-bar__clear:hover {
  color: var(--text-primary);
  background-color: var(--bg-overlay);
}

.search-bar__clear:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.proto-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-6) var(--space-8);
}

/* 平板起两列 */
@media (min-width: 768px) {
  .proto-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* 桌面起三列 */
@media (min-width: 1280px) {
  .proto-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

/* 搜索无匹配空态:居中文案 + 清空搜索操作 */
.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-12) var(--space-6);
  text-align: center;
}

.search-empty__title {
  margin: 0;
  font-size: var(--text-md);
  line-height: var(--text-md--line);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.search-empty__hint {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--text-sm--line);
  color: var(--text-secondary);
}

.search-empty__action {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: var(--border-width) solid var(--border-base);
  border-radius: var(--radius-md);
  background-color: var(--bg-elevated);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.search-empty__action:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.search-empty__action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.proto-empty {
  display: flex;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
}
</style>
