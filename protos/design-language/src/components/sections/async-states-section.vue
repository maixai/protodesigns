<script setup lang="ts">
// 异步四态:由真实的 api 层 + delay() 驱动,不写假的 loading 分支。
// 三个场景按钮分别触发有数据 / 空 / 失败,便于评审逐态核对。
import { NButton, NSpin } from 'naive-ui'
import { onMounted, ref } from 'vue'

import { fetchSamples } from '../../api/sample'
import type { SampleScenario } from '../../api/sample'
import type { SampleRecord, SampleStatus } from '../../api/sample.types'

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const records = ref<SampleRecord[]>([])

// 状态枚举的展示名:契约里存英文取值,界面上呈现中文。
const STATUS_LABEL: Readonly<Record<SampleStatus, string>> = {
  active: '进行中',
  paused: '已暂停',
  archived: '已归档',
}

const SCENARIOS: readonly { key: SampleScenario; label: string }[] = [
  { key: 'normal', label: '有数据' },
  { key: 'empty', label: '空态' },
  { key: 'error', label: '失败态' },
]

async function load(scenario: SampleScenario): Promise<void> {
  isLoading.value = true
  errorMessage.value = null
  const result = await fetchSamples(scenario)
  if (result.ok) {
    records.value = result.value
  } else {
    errorMessage.value = result.error.message
    records.value = []
  }
  isLoading.value = false
}

onMounted(() => {
  void load('normal')
})
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">异步四态</h2>
    <p class="dl-section__note">
      依赖异步数据的视图必须覆盖四态;loading 不能是白屏,空态要有出路,失败态要能重试。
    </p>

    <div class="dl-row">
      <n-button
        v-for="scenario in SCENARIOS"
        :key="scenario.key"
        size="small"
        @click="load(scenario.key)"
      >
        {{ scenario.label }}
      </n-button>
    </div>

    <div class="stage">
      <div v-if="isLoading" class="stage__loading">
        <n-spin size="small" />
        <span class="stage__hint">正在加载样例记录…</span>
      </div>

      <div v-else-if="errorMessage" class="stage__error" role="alert">
        <span class="stage__error-text">{{ errorMessage }}</span>
        <n-button size="small" @click="load('error')">重试</n-button>
      </div>

      <div v-else-if="records.length === 0" class="stage__empty">
        <span class="stage__hint">还没有样例记录。</span>
        <n-button size="small" type="primary" @click="load('normal')">载入示例数据</n-button>
      </div>

      <ul v-else class="list">
        <li v-for="record in records" :key="record.id" class="list__item">
          <span class="list__id">{{ record.id }}</span>
          <span class="list__title">{{ record.title }}</span>
          <span class="list__owner">{{ record.owner }}</span>
          <span class="list__status">{{ STATUS_LABEL[record.status] }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.stage {
  margin-top: var(--dl-space-3);
  padding: var(--dl-space-3);
  min-height: 6rem;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.stage__loading,
.stage__empty,
.stage__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--dl-space-2);
  min-height: 4.5rem;
  text-align: center;
}

.stage__error-text {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-error);
}

.stage__hint {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-tertiary);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list__item {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  padding: var(--dl-space-2) 0;
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
  font-size: var(--dl-font-size-sm);
}

.list__item:last-child {
  border-bottom: none;
}

.list__id {
  flex: none;
  color: var(--dl-text-tertiary);
}

.list__title {
  color: var(--dl-text-primary);
  font-weight: var(--dl-weight-medium);
}

.list__owner {
  margin-left: auto;
  color: var(--dl-text-secondary);
}

.list__status {
  flex: none;
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
  padding: 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
}
</style>
