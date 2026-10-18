<script setup lang="ts">
// Agent 是导航上下文;选择器只请求切域,不干预后台会话的生命周期。
//
// 位置:常驻底栏的最左端(外壳第三行),右侧紧接最小化区。底栏是**横向密集行**,
// 故触发钮取 32px 档(与底栏其他控件同档),不再是侧栏里那枚 44px 的独立按钮;
// 形制是圆角矩形 —— 首字标记 + 名称 + 未查看计数 + chevron。
//
// 面板**向上**展开(底栏在视口底部),左缘与触发钮对齐;它是 navigation choices,
// 不是命令菜单,故用 disclosure 语义(aria-expanded + aria-current),不用 role=menu。
import { computed, nextTick, onMounted, onBeforeUnmount, ref } from 'vue'
import type { AgentId } from '../contracts/generated/chat-session'
import { useI18n } from '../i18n'

const props = withDefaults(defineProps<{
  value: AgentId
  agents: readonly AgentId[]
  // 两个宿主:底栏(紧凑档,向上展开)/ 侧栏顶部(整行控件,向下展开)。
  variant?: 'dock' | 'sidebar'
}>(), { variant: 'dock' })
const emit = defineEmits<{ select: [agent: AgentId] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const isOpen = ref(false)
// 触发钮的可访问名 = 控件用途 + 当前 Agent + 它的角色(视觉上角色是第二行,读屏也要读到)。
const triggerLabel = computed(() => `${t.value.workspace.agentSwitcher.label} · ${t.value.workspace.agents[props.value]} · ${t.value.workspace.agentRoles[props.value]}`)
// 首字标记:窄屏只留它 + chevron 时,用户仍能认出当前 Agent(名称在 aria-label 里保留)。
function initialOf(agent: AgentId): string {
  return t.value.workspace.agents[agent].slice(0, 1)
}
function close(restoreFocus = false): void {
  isOpen.value = false
  if (restoreFocus) trigger.value?.focus()
}
async function toggle(): Promise<void> {
  if (isOpen.value) { close(); return }
  isOpen.value = true
  await nextTick()
  panel.value?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
}
function select(agent: AgentId): void {
  close(true)
  emit('select', agent)
}
function onKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  const buttons = Array.from(panel.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
  const index = buttons.findIndex((button) => button === document.activeElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : -1
  if (next < 0) return
  event.preventDefault()
  buttons[next]?.focus()
}
function onOutside(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
function onFocusOut(event: FocusEvent): void {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) close()
}
onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="agent-context-switcher" :data-variant="variant" @keydown="onKeydown" @focusout="onFocusOut">
    <button ref="trigger" type="button" class="agent-context-switcher__trigger" :data-agent="value" :aria-label="triggerLabel" :aria-expanded="isOpen" aria-controls="agent-context-panel" @click="toggle">
      <span class="agent-context-switcher__mark" aria-hidden="true">{{ initialOf(value) }}</span>
      <span class="agent-context-switcher__body">
        <span class="agent-context-switcher__name">{{ t.workspace.agents[value] }}</span>
        <span class="agent-context-switcher__role">{{ t.workspace.agentRoles[value] }}</span>
      </span>
      <svg class="agent-context-switcher__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <Transition name="agent-context-panel">
      <div v-if="isOpen" id="agent-context-panel" ref="panel" class="agent-context-switcher__panel" role="group" :aria-label="t.workspace.agentSwitcher.menu">
        <p class="agent-context-switcher__title">{{ t.workspace.agentSwitcher.menu }}</p>
        <button v-for="agent in agents" :key="agent" type="button" class="agent-context-switcher__option" :data-agent="agent" :aria-current="agent === value ? 'true' : undefined" @click="select(agent)">
          <span class="agent-context-switcher__option-mark" aria-hidden="true">{{ initialOf(agent) }}</span>
          <span class="agent-context-switcher__option-body">
            <span class="agent-context-switcher__option-name">{{ t.workspace.agents[agent] }}</span>
            <span class="agent-context-switcher__option-role">{{ t.workspace.agentRoles[agent] }}</span>
          </span>
          <svg v-if="agent === value" class="agent-context-switcher__check" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4 9-9" /></svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 触发钮是底栏横向密集行的行内控件:32px 档,圆角矩形(--dl-radius-md)。
   它坐在底栏的 elevated 底上,故只用发丝描边 + hover 变色来表明可点。 */
.agent-context-switcher { position: relative; flex: none; min-width: 0; z-index: var(--dl-z-overlay); }
.agent-context-switcher__trigger { display: inline-flex; align-items: center; gap: var(--dl-space-2); block-size: var(--workspace-nav-control-size, 32px); max-inline-size: 220px; padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: 1; text-align: left; }
.agent-context-switcher__mark { display: inline-grid; flex: none; place-items: center; inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 500; }
.agent-context-switcher__body { display: grid; gap: 1px; min-width: 0; }
.agent-context-switcher__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-context-switcher__role { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.agent-context-switcher__chevron { flex: none; inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); color: var(--dl-text-tertiary); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.agent-context-switcher__chevron path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.agent-context-switcher__trigger[aria-expanded='true'] .agent-context-switcher__chevron { transform: rotate(180deg); }
/* 面板**向上**展开:底栏贴视口底部,向下没有空间。左缘与触发钮对齐,宽度钳在视口内;
   最大高度按「视口 - 底栏 - 两侧留白」算,内容多时面板内部滚动。 */
.agent-context-switcher__panel { position: absolute; inset-block-end: calc(100% + var(--dl-space-2)); inset-inline-start: 0; z-index: var(--dl-z-overlay); display: grid; gap: var(--dl-space-1); inline-size: min(320px, calc(100vw - 2 * var(--dl-space-4))); max-block-size: min(60dvh, calc(100dvh - var(--dl-space-12))); overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); transform-origin: bottom left; }
.agent-context-switcher__title { padding: var(--dl-space-1) var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-label); }
.agent-context-switcher__option { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); min-height: calc(var(--dl-target-size) + var(--dl-space-1)); min-width: 0; padding: var(--dl-space-2); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; }
.agent-context-switcher__option-mark { display: inline-grid; place-items: center; inline-size: var(--dl-control-height); block-size: var(--dl-control-height); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.agent-context-switcher__option-body { display: grid; gap: 2px; min-width: 0; }
.agent-context-switcher__option-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.agent-context-switcher__option-role { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.agent-context-switcher__check { flex: none; inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); color: var(--dl-accent); }
.agent-context-switcher__check path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.agent-context-switcher__option[aria-current='true'] { background: var(--dl-accent-soft); }
.agent-context-switcher__option[aria-current='true'] .agent-context-switcher__option-mark { background: var(--dl-bg-elevated); color: var(--dl-text-primary); }
/* 开合只动 opacity / transform(动效白名单);位移 4px 从触发钮方向浮出。 */
.agent-context-panel-enter-active, .agent-context-panel-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.agent-context-panel-enter-from, .agent-context-panel-leave-to { opacity: 0; transform: translateY(var(--dl-space-1)); }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
/* 窄屏(侧栏已收成抽屉)只留首字标记 + chevron:底栏要给最小化条目与状态簇让位。
   名称不截断,而是整体让位;可访问名仍在 aria-label 里。 */
/* ---- 侧栏顶部宿主:整行控件,向下展开 ---- */
/* 侧栏头部是**身份区**而不是一个输入框:去掉描边与填色,让「标记 + 名称 + 角色」自己成为
   层级;悬停才出现一档浅底,提示它是可展开的。这也是 Notion / Linear / shadcn 侧栏
   workspace switcher 的既有做法 —— 触发器读起来像一条安静的导航行,而不是一张卡片。 */
.agent-context-switcher[data-variant='sidebar'] {
  inline-size: 100%;
  flex: 1 1 auto;
}

.agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__trigger {
  inline-size: 100%;
  max-inline-size: none;
  block-size: auto;
  min-block-size: 48px;
  padding: var(--dl-space-1) var(--dl-space-2);
  border-color: transparent;
  background: transparent;
  gap: var(--dl-space-3);
  line-height: var(--dl-line-snug);
}

.agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__mark {
  inline-size: var(--dl-control-height);
  block-size: var(--dl-control-height);
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
}

.agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__name {
  font-weight: 500;
}

.agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__chevron {
  margin-inline-start: auto;
}

.agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__panel {
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-block-end: auto;
  inline-size: 100%;
  max-inline-size: none;
  max-block-size: min(60dvh, calc(100dvh - var(--dl-space-12)));
  transform-origin: top left;
}

/* 窄屏抽屉里触发钮右侧还并排一枚关闭钮;面板补上这段宽度,右缘与抽屉内容右缘对齐。 */
@media (max-width: 1023px) {
  .agent-context-switcher[data-variant='sidebar'] .agent-context-switcher__panel {
    inline-size: calc(100% + var(--dl-target-size) + var(--dl-space-2));
  }
}

/* 向下展开的浮层从上方落下(与向上展开的底栏面板方向相反)。 */
.agent-context-switcher[data-variant='sidebar'] .agent-context-panel-enter-from,
.agent-context-switcher[data-variant='sidebar'] .agent-context-panel-leave-to {
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

/* 底栏宿主保持 32px 单行:角色说明只属于侧栏身份区,不在紧凑工具行里占第二行。 */
.agent-context-switcher[data-variant='dock'] .agent-context-switcher__role { display: none; }

@media (max-width: 1023px) {
  .agent-context-switcher[data-variant='dock'] .agent-context-switcher__name { display: none; }
  .agent-context-switcher[data-variant='dock'] .agent-context-switcher__trigger { max-inline-size: none; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-context-panel-enter-active, .agent-context-panel-leave-active { transition: none; }
  button:active { transform: none; }
}
</style>
