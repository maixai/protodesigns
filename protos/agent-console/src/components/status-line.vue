<script setup lang="ts">
// 底部状态行:模型名、工作目录、token 消耗、本轮耗时与快捷键提示。
import type { SessionMeta } from '../api/agent.types'

const props = defineProps<{
  meta: SessionMeta
  inputTokensText: string
  outputTokensText: string
  elapsedText: string
}>()
</script>

<template>
  <footer class="status" data-testid="status-line">
    <div class="status__inner">
      <div class="status__meta">
        <span class="status__model">{{ props.meta.modelName }}</span>
        <span class="status__sep" aria-hidden="true">·</span>
        <span class="status__cwd" :title="props.meta.cwd">{{ props.meta.cwd }}</span>
        <span class="status__sep" aria-hidden="true">·</span>
        <span class="status__tokens">
          <span class="status__token" title="输入 token">
            <span aria-hidden="true">↑</span>{{ props.inputTokensText }}
          </span>
          <span class="status__token" title="输出 token">
            <span aria-hidden="true">↓</span>{{ props.outputTokensText }}
          </span>
        </span>
        <span class="status__sep" aria-hidden="true">·</span>
        <span class="status__elapsed" title="本轮耗时">{{ props.elapsedText }}</span>
      </div>
      <div class="status__hints">
        <span class="status__hint"><kbd class="status__key">esc</kbd>中断</span>
        <span class="status__hint"><kbd class="status__key">enter</kbd>发送</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.status {
  flex-shrink: 0;
  background: var(--dl-bg-sunken);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.status__inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--dl-space-1) var(--dl-space-4);
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

.status__meta {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: 0;
}

.status__model {
  color: var(--dl-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.status__cwd {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.status__sep {
  color: var(--dl-text-disabled);
}

.status__tokens {
  display: flex;
  gap: var(--dl-space-2);
  white-space: nowrap;
}

.status__token {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
}

.status__elapsed {
  white-space: nowrap;
}

.status__hints {
  margin-left: auto;
  display: flex;
  gap: var(--dl-space-3);
  white-space: nowrap;
}

.status__hint {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
}

.status__key {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  padding: 0 var(--dl-space-1);
}

/* 窄窗口:优先保留左侧元信息,快捷键提示换行到第二行。 */
@media (max-width: 560px) {
  .status__inner {
    flex-wrap: wrap;
    row-gap: var(--dl-space-1);
  }

  .status__hints {
    margin-left: 0;
    flex: 1 0 100%;
  }
}
</style>
