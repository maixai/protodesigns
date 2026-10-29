<script setup lang="ts">
// 三处账户入口共用同一个内存头像;整棵标记对读屏隐藏,语义由外层按钮或文字承担。
import { computed } from 'vue'
import { accountAvatar, toInitials } from './account-avatar'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})
const initials = computed(() => toInitials(props.name))
</script>

<template>
  <span class="account-avatar" :class="`account-avatar--${size}`" aria-hidden="true">
    <img v-if="accountAvatar !== null" :src="accountAvatar" alt="">
    <span v-else>{{ initials }}</span>
  </span>
</template>

<style scoped>
.account-avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-pill);
  font-weight: 500;
}
.account-avatar--sm { inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg); font-size: var(--dl-font-size-xs); }
.account-avatar--md { inline-size: calc(var(--dl-space-8) + var(--dl-space-2)); block-size: calc(var(--dl-space-8) + var(--dl-space-2)); font-size: var(--dl-font-size-md); }
.account-avatar--lg { inline-size: calc(var(--dl-space-12) + var(--dl-space-4)); block-size: calc(var(--dl-space-12) + var(--dl-space-4)); font-size: var(--dl-font-size-xl); }
.account-avatar img { inline-size: 100%; block-size: 100%; object-fit: cover; }
</style>
