<script setup lang="ts">
// 语言切换器:紧凑 disclosure 下拉(触发钮 + 弹出层若干原生按钮)。
// 形态依据 USWDS 语言选择器规范:触发钮显示当前语言的母语名(endonym),
// 地球图标只作辅助(不单独承担含义);弹出层用各语言的母语名列出,
// 当前语种有选中标记(aria-current + 钩号 + 字重,三通道)。
//
// 刻意不用的做法(均踩过或有明确规范指引):
//   - NDropdown:弹出的选项是 div[role="menuitemradio"] 且无 tabindex,键盘不可达;
//   - role="menu" / role="listbox":W3C 明确语言选择不是这两种模式,
//     弹出层就是一个带可访问名的普通容器(role="group"),里面放原生 button。
//
// 键盘约定(固定,行为可预期):
//   - Tab 可达触发钮;Enter / Space 打开弹出层并把焦点送入第一个选项;
//   - 选项是原生 button,Tab / Shift+Tab 在选项间(以及进出弹出层)按 DOM 序移动;
//   - 焦点移出整个控件(触发钮 + 弹出层)即关闭(focusout 判定 relatedTarget);
//   - 在选项上 Enter / Space 选中并切换语言;Esc 关闭 —— 两者都把焦点还给触发钮;
//   - 指针路径:点击触发钮开合(不移焦点),点击弹出层外任意处关闭。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'
import type { Locale } from '../i18n'

const { t, locale, setLocale } = useI18n()

// 语言名一律用母语名(endonym),不随界面语言翻译;选项的 lang 属性标注其语言。
const languages: readonly { key: Locale; label: string }[] = [
  { key: 'zh-CN', label: '中文' },
  { key: 'en', label: 'English' },
]

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

// 触发钮上显示的当前语种母语名(locale 必然命中,?. 兜底仅为类型完备)。
const currentLabel = computed(
  () => languages.find((language) => language.key === locale.value)?.label ?? '',
)

// 打开;键盘路径(focusFirst)把焦点送入弹出层第一个选项,指针路径不移焦点。
async function open(focusFirst: boolean): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (!focusFirst) return
  // 弹出层 v-if 渲染,需等 DOM 提交后才能聚焦
  await nextTick()
  popoverRef.value?.querySelector('button')?.focus()
}

// 关闭;restoreFocus 把焦点还给触发钮(键盘选中 / Esc 路径),指针关闭不留焦点残骸。
function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // 离场过渡期间弹层仍在 DOM 里(fade 200ms),若不先摘掉它的交互性,
  // 这段时间内按 Tab 会把焦点落进正在淡出的选项,元素被移除后焦点掉到 body。
  // 直接改 DOM 属性而非绑 :inert —— 该元素此刻已从 vdom 摘除,绑定的更新不会再到它身上。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

// 触发钮 click:键盘激活(Enter / Space)派生的 click 事件 detail 为 0,
// 用它区分键盘与指针路径 —— 键盘打开后焦点进弹出层,指针打开焦点留在触发钮。
function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  void open(event.detail === 0)
}

function onSelect(key: Locale): void {
  setLocale(key)
  close(true)
}

// Esc(事件从触发钮 / 选项冒泡到根):关闭并把焦点还给触发钮。
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  close(true)
}

// 焦点移出整个控件即关闭:focusout 触发时新焦点尚未落定,去处看 relatedTarget。
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

// 点击控件外任意处关闭;pointerdown 先于 click 落定,关闭后点击照常作用于目标。
function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div
    ref="rootRef"
    class="language-switcher"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <button
      ref="triggerRef"
      type="button"
      class="language-switcher__trigger"
      :aria-expanded="isOpen"
      aria-controls="language-switcher-popover"
      :aria-label="`${t.nav.switchLanguage}:${currentLabel}`"
      @click="onTriggerClick"
    >
      <!-- 地球图标:辅助性图形(aria-hidden),内联 SVG;描边统一 --dl-icon-stroke,不随尺寸缩放 -->
      <svg
        class="language-switcher__globe"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <g stroke="currentColor" stroke-width="var(--dl-icon-stroke)" stroke-linecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a13.5 13.5 0 0 1 0 18" />
          <path d="M12 3a13.5 13.5 0 0 0 0 18" />
        </g>
      </svg>
      <span class="language-switcher__current">{{ currentLabel }}</span>
      <!-- 向下小箭头:开合状态的辅助指示(aria-expanded 是主通道),打开时翻转 180° -->
      <svg
        class="language-switcher__chevron"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 9.5l6 6 6-6"
          stroke="currentColor"
          stroke-width="var(--dl-icon-stroke)"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <Transition name="language-switcher-pop">
      <!-- 弹出层:普通容器 + 可访问名(role="group"),选项是原生 button,天然可聚焦 -->
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
          :key="language.key"
          type="button"
          class="language-switcher__option"
          :class="{ 'language-switcher__option--current': locale === language.key }"
          :aria-current="locale === language.key ? 'true' : undefined"
          :lang="language.key"
          @click="onSelect(language.key)"
        >
          <!-- 选中标记槽位:固定宽,当前语种显示钩号,非当前留空以保持文字对齐 -->
          <span class="language-switcher__check" aria-hidden="true">
            <svg v-if="locale === language.key" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="currentColor"
                stroke-width="var(--dl-icon-stroke)"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          {{ language.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.language-switcher {
  position: relative;
}

/* 触发钮:发丝描边外壳;命中区由元素本体撑到指针目标下限,不靠伪元素外扩 */
.language-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
  background-color: transparent;
  white-space: nowrap;
  transition:
    background-color var(--dl-duration-fast) var(--dl-ease-standard),
    border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.language-switcher__trigger:hover {
  background-color: var(--dl-bg-hover);
}

.language-switcher__trigger:active {
  background-color: var(--dl-bg-active);
}

.language-switcher__globe {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
  flex: none;
}

.language-switcher__chevron {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-tertiary);
  flex: none;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.language-switcher__trigger[aria-expanded='true'] .language-switcher__chevron {
  transform: rotate(180deg);
}

/* 弹出层:抬起的浮层(描边 + 轻阴影),右缘对齐触发钮,层序走 token */
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
  box-shadow: var(--dl-shadow-md);
}

/* 选项:原生 button,元素本体宽高都不小于指针目标下限 */
.language-switcher__option {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
  white-space: nowrap;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.language-switcher__option:hover {
  background-color: var(--dl-bg-hover);
}

.language-switcher__option:active {
  background-color: var(--dl-bg-active);
}

/* 当前语种:字重 500 + 青瓷钩号 + aria-current,不只靠颜色区分 */
.language-switcher__option--current {
  font-weight: 500;
}

.language-switcher__check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-accent);
  flex: none;
}

.language-switcher__check svg {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
}

/* 弹层进出:只动 transform / opacity(白名单属性),时长与缓动走 token;
   prefers-reduced-motion 由全局规则降级 */
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
