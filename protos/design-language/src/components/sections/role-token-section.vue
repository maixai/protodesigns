<script setup lang="ts">
// 语义角色层:组件唯一允许引用的那一层。这里列出每个角色变量指向哪个 ramp 阶 ——
// 换方向时这张映射表不变,而它解析出的颜色会整体改变,这正是三层架构的意义。
const ROLES = [
  { token: '--dl-bg-base', maps: 'neutral-50', usage: '页面底色' },
  { token: '--dl-bg-elevated', maps: 'neutral-0', usage: '卡片 / 浮层表面' },
  { token: '--dl-bg-sunken', maps: 'neutral-100', usage: '凹陷区 / 代码块' },
  { token: '--dl-border-base', maps: 'neutral-200', usage: '默认描边 / 分割线' },
  { token: '--dl-border-strong', maps: 'neutral-300', usage: '强调描边' },
  { token: '--dl-text-primary', maps: 'neutral-900', usage: '标题 / 正文' },
  { token: '--dl-text-secondary', maps: 'neutral-600', usage: '次级文字' },
  { token: '--dl-text-tertiary', maps: 'neutral-500', usage: '辅助说明' },
  { token: '--dl-text-disabled', maps: 'neutral-400', usage: '禁用文字' },
  { token: '--dl-accent', maps: 'accent-600', usage: '主操作 / 选中态' },
  { token: '--dl-accent-hover', maps: 'accent-500', usage: '主操作 hover' },
  { token: '--dl-accent-active', maps: 'accent-700', usage: '主操作 active' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">语义角色层</h2>
    <p class="dl-section__note">
      组件只引用左列;直接引用 ramp 阶(--dl-accent-600 等)属于违规,因为它绕过了主题与方向。
    </p>

    <div class="dl-grid roles">
      <div v-for="role in ROLES" :key="role.token" class="role">
        <code class="role__token">{{ role.token }}</code>
        <span class="role__maps">→ {{ role.maps }}</span>
        <span class="role__usage">{{ role.usage }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.roles {
  gap: var(--dl-space-1);
}

.role {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  padding-bottom: var(--dl-space-1);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.role__token {
  flex: none;
  width: 11.5em;
  color: var(--dl-text-secondary);
}

.role__maps {
  flex: none;
  color: var(--dl-text-tertiary);
}

.role__usage {
  margin-left: auto;
  color: var(--dl-text-tertiary);
  text-align: right;
}
</style>
