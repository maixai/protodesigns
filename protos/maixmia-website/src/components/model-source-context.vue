<script setup lang="ts">
import { useI18n } from '../i18n'

// 这里只呈现父级草稿的来源事实,不读写来源配置或保存状态。
defineProps({
  name: { type: String, required: true },
  account: { type: String, required: true },
  isDraftChanged: { type: Boolean, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="model-source-context" :data-pending="isDraftChanged ? 'true' : undefined">
    <span class="model-source-context__dot" aria-hidden="true" />
    <div class="model-source-context__facts">
      <span class="model-source-context__label">{{ t.workspace.agentAdmin.sourceContextLabel }}</span>
      <span v-if="isDraftChanged" class="model-source-context__switching">{{ t.workspace.agentAdmin.sourceContextSwitching }}</span>
      <span class="model-source-context__name">{{ name || t.workspace.agentAdmin.sourceContextEmpty }}</span>
      <span v-if="account !== ''" class="model-source-context__account">{{ account }}</span>
    </div>
    <div class="model-source-context__actions">
      <button type="button" class="model-source-context__change" :disabled="disabled" @click="emit('change')">
        {{ name === '' ? t.workspace.agentAdmin.sourceContextConfigure : t.workspace.agentAdmin.sourceContextChange }}
      </button>
      <span v-if="isDraftChanged" class="model-source-context__draft">{{ t.workspace.agentAdmin.sourceContextDraft }}</span>
    </div>
  </div>
</template>

<style scoped>
.model-source-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  min-inline-size: 0;
  min-block-size: var(--dl-target-size);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  padding: var(--dl-space-2) var(--dl-space-3);
  background: var(--dl-bg-base);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}
.model-source-context:hover { border-color: var(--dl-border-strong); }
.model-source-context__dot {
  flex: none;
  inline-size: var(--dl-space-2);
  block-size: var(--dl-space-2);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-accent);
}
.model-source-context[data-pending='true'] .model-source-context__dot { background: var(--dl-warning); }
.model-source-context__facts {
  display: flex;
  flex: 1 1 calc(var(--dl-target-size) * 4);
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--dl-space-2);
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.model-source-context__label, .model-source-context__account, .model-source-context__switching { color: var(--dl-text-tertiary); }
.model-source-context__name { color: var(--dl-text-primary); }
.model-source-context__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  max-inline-size: 100%;
  /* 扩大按钮命中区而不把紧凑的上下文块撑成重卡片。 */
  margin-block: calc(-1 * var(--dl-space-2));
  margin-inline-start: auto;
}
.model-source-context__draft { color: var(--dl-warning); overflow-wrap: anywhere; }
.model-source-context__change {
  flex-shrink: 0;
  min-inline-size: var(--dl-target-size);
  min-block-size: var(--dl-target-size);
  border: none;
  border-radius: var(--dl-radius-sm);
  padding: 0 var(--dl-space-1);
  background: transparent;
  color: var(--dl-accent);
  font: inherit;
  cursor: pointer;
}
.model-source-context__change:hover { background: var(--dl-bg-hover); }
.model-source-context__change:active { color: var(--dl-accent-active); background: var(--dl-bg-sunken); }
.model-source-context__change:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.model-source-context__change:disabled { color: var(--dl-text-disabled); background: transparent; cursor: not-allowed; }
</style>
