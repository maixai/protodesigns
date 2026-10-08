<script setup lang="ts">
// 语言选择是 disclosure 而不是 menu / listbox:普通命名容器里放原生按钮,
// 避免 NDropdown 的不可聚焦选项。触发钮保留首页原有外观,不增加图标或高度。
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'
import type { Locale } from '../i18n'

const { t, locale, setLocale } = useI18n()
const languages = ['zh-CN', 'en'] satisfies Locale[]
const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

async function open(focusFirst: boolean): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (!focusFirst) return
  await nextTick()
  popoverRef.value?.querySelector('button')?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // 离场节点已从 vdom 摘除,直接设 inert,避免 Tab 落入正在淡出的选项。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  // 键盘派生的 click.detail 为 0:打开后聚焦首项;指针打开不移焦点。
  void open(event.detail === 0)
}

function onSelect(key: Locale): void {
  setLocale(key)
  close(true)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  close(true)
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="rootRef" class="language-switcher" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef"
      type="button"
      class="site-header__lang"
      :aria-expanded="isOpen"
      aria-controls="language-switcher-popover"
      :aria-label="t.nav.language"
      @click="onTriggerClick"
    >
      {{ locale === 'zh-CN' ? '中文' : 'EN' }}
    </button>
    <Transition name="language-switcher-pop">
      <div
        v-if="isOpen"
        id="language-switcher-popover"
        ref="popoverRef"
        class="language-switcher__popover"
        role="group"
        :aria-label="t.nav.language"
      >
        <button
          v-for="language in languages"
          :key="language"
          type="button"
          class="language-switcher__option"
          :class="{ 'language-switcher__option--current': locale === language }"
          :aria-current="locale === language ? 'true' : undefined"
          :lang="language"
          @click="onSelect(language)"
        >
          {{ language === 'zh-CN' ? '中文' : 'English' }}
          <span v-if="locale === language" class="language-switcher__status">{{ t.nav.currentLanguage }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.language-switcher {
  position: relative;
  display: flex;
}

/* 保留首页既有触发钮的几何与配色;只移除非白名单颜色过渡。 */
.site-header__lang {
  min-height: var(--dl-control-height);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

.site-header__lang:hover {
  background-color: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.language-switcher__popover {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  min-width: 100%;
  padding: var(--dl-space-1);
  background-color: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.language-switcher__option {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
  text-align: left;
  white-space: nowrap;
}

.language-switcher__option:hover {
  background-color: var(--dl-bg-hover);
}

.language-switcher__option:active {
  transform: translateY(var(--dl-lift-press));
}

.language-switcher__option--current {
  font-weight: 500;
}

.language-switcher__status {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.language-switcher-pop-enter-active,
.language-switcher-pop-leave-active {
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard);
}

.language-switcher-pop-enter-from,
.language-switcher-pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--dl-space-1)));
}
</style>
