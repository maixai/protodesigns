// 连接状态只由可达性与既有信任状态派生，不读取任务的思考 / 输出状态。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Messages } from '../i18n'

function relativeLastSeen(value: string, locale: string, fallback: string, now: number): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return fallback
  const elapsed = Math.max(0, now - timestamp)
  const unit = elapsed >= 86_400_000 ? 'day' : elapsed >= 3_600_000 ? 'hour' : 'minute'
  const divisor = unit === 'day' ? 86_400_000 : unit === 'hour' ? 3_600_000 : 60_000
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(-Math.floor(elapsed / divisor), unit)
}

// 统一优先级：认证失败 > 离线 > 在线。调用方只负责呈现，不再拼装信任与可达性。
export function agentDisplayStatus(agent: AgentSummary, copy: Messages['workspace'], locale: string, now = Date.now()) {
  const state = agent.identity.trustState !== 'trusted' ? 'authenticationFailed' : agent.availability
  const label = copy.agentConnection[state]
  const detail = state === 'authenticationFailed'
    ? copy.agentConnection.authenticationDetail.replace('{reason}', copy.security[agent.identity.trustState])
    : state === 'offline'
      ? copy.agentConnection.offlineDetail.replace('{time}', relativeLastSeen(agent.identity.lastSeenAt, locale, copy.agentConnection.unknownLastSeen, now))
      : ''
  return { state, label, tooltip: detail === '' ? label : `${label} · ${detail}` }
}

// 两处状态提示共用开合、定位和动效生命周期；在线始终保持安静。
// popover 留在原有 DOM 树继承主题，但进入 top layer 避开祖先滚动裁切。
export function useAgentStatusTooltip(
  findAgent: (id: string) => AgentSummary | undefined,
  describe: (agent: AgentSummary) => ReturnType<typeof agentDisplayStatus>,
  getBoundary: (anchor: HTMLElement) => DOMRect | undefined = () => undefined,
  preferAbove = false,
) {
  const tooltip = ref<HTMLElement | null>(null)
  const tooltipAnchor = ref<HTMLElement | null>(null)
  const tooltipAgentId = ref('')
  const isTooltipOpen = ref(false)
  const isTooltipVisible = ref(false)
  const tooltipId = `agent-connection-${Math.random().toString(36).slice(2)}`
  const status = computed(() => {
    const agent = findAgent(tooltipAgentId.value)
    return agent === undefined ? null : describe(agent)
  })
  const tooltipText = computed(() => status.value?.tooltip ?? '')
  const hideTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = ref<ReturnType<typeof setTimeout> | null>(null)
  const showFrame = ref<number | null>(null)

  function setTooltipRef(element: unknown): void {
    tooltip.value = element instanceof HTMLElement ? element : null
  }
  function duration(): number {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
    return Number.parseFloat(getComputedStyle(tooltip.value ?? document.documentElement).getPropertyValue('--dl-duration-fast'))
  }
  function clearTooltipTimer(): void {
    if (hideTimer.value !== null) clearTimeout(hideTimer.value)
    hideTimer.value = null
  }
  function clearAnimation(): void {
    if (closeTimer.value !== null) clearTimeout(closeTimer.value)
    if (showFrame.value !== null) cancelAnimationFrame(showFrame.value)
    closeTimer.value = null
    showFrame.value = null
  }
  function finishClose(): void {
    if (isTooltipVisible.value) return
    clearAnimation()
    if (tooltip.value?.matches(':popover-open')) tooltip.value.hidePopover()
    isTooltipOpen.value = false
    tooltipAnchor.value = null
    tooltipAgentId.value = ''
  }
  // 容器关闭 / 卸载时立即移除，避免提示脱离所属对话框独自留在顶层。
  function dismissTooltip(): void {
    clearTooltipTimer()
    clearAnimation()
    isTooltipVisible.value = false
    finishClose()
  }
  function hideTooltip(): void {
    clearTooltipTimer()
    clearAnimation()
    tooltipAnchor.value = null
    isTooltipVisible.value = false
    const ms = duration()
    if (!isTooltipOpen.value || ms === 0) { finishClose(); return }
    // 淡出完成才关闭 popover；定时兜底覆盖浏览器取消 transitionend 的情况。
    closeTimer.value = setTimeout(finishClose, ms)
  }
  function onTooltipTransitionEnd(event: TransitionEvent): void {
    if (event.target === tooltip.value && event.propertyName === 'opacity' && !isTooltipVisible.value) finishClose()
  }
  function positionTooltip(): void {
    const bubble = tooltip.value
    const anchor = tooltipAnchor.value
    if (!isTooltipOpen.value || bubble === null || anchor === null) return
    if (!anchor.isConnected || anchor.getClientRects().length === 0) { dismissTooltip(); return }
    const gap = Number.parseFloat(getComputedStyle(bubble).getPropertyValue('--dl-space-2'))
    const rect = anchor.getBoundingClientRect()
    const bounds = bubble.getBoundingClientRect()
    const boundary = getBoundary(anchor) ?? rect
    const beside = !preferAbove && boundary.right + gap + bounds.width <= window.innerWidth - gap
    const left = Math.max(gap, Math.min(beside ? boundary.right + gap : boundary.left, window.innerWidth - bounds.width - gap))
    const above = boundary.top - bounds.height - gap
    const below = boundary.bottom + gap
    const top = preferAbove && above >= gap ? above
      : beside ? rect.top + (rect.height - bounds.height) / 2
        : below + bounds.height <= window.innerHeight - gap ? below : above
    // 几何值来自实际矩形，边缘距离来自结构 token，不散落视觉常量。
    bubble.style.setProperty('--agent-status-left', `${left}px`)
    bubble.style.setProperty('--agent-status-top', `${Math.max(gap, Math.min(top, window.innerHeight - bounds.height - gap))}px`)
  }
  async function showTooltip(event: PointerEvent | FocusEvent, agent: AgentSummary | undefined): Promise<void> {
    const anchor = event.currentTarget
    if (!(anchor instanceof HTMLElement) || agent === undefined) return
    if (describe(agent).state === 'online') { hideTooltip(); return }
    if (event instanceof PointerEvent && event.pointerType !== 'mouse') return
    if (event instanceof FocusEvent && !anchor.matches(':focus-visible')) return
    clearTooltipTimer()
    clearAnimation()
    tooltipAnchor.value = anchor
    tooltipAgentId.value = agent.id
    await nextTick()
    if (tooltipAnchor.value !== anchor || tooltip.value === null || anchor.getClientRects().length === 0) return
    const wasOpen = tooltip.value.matches(':popover-open')
    if (!wasOpen) tooltip.value.showPopover()
    isTooltipOpen.value = true
    positionTooltip()
    if (wasOpen || duration() === 0) { isTooltipVisible.value = true; return }
    // 先提交透明的顶层元素，再在下一绘制帧淡入，不使用位移或缩放。
    showFrame.value = requestAnimationFrame(() => {
      showFrame.value = requestAnimationFrame(() => {
        isTooltipVisible.value = true
        showFrame.value = null
      })
    })
  }
  function scheduleTooltipClose(): void {
    clearTooltipTimer()
    hideTimer.value = setTimeout(() => {
      if (tooltipAnchor.value?.matches(':focus-visible')) return
      hideTooltip()
    }, duration())
  }
  function leaveTooltip(event: PointerEvent | FocusEvent): void {
    if (event.currentTarget === tooltipAnchor.value) scheduleTooltipClose()
  }
  watch(status, async (value): Promise<void> => {
    if (value?.state === 'online') { hideTooltip(); return }
    await nextTick()
    positionTooltip()
  })
  onMounted(() => {
    window.addEventListener('scroll', positionTooltip, true)
    window.addEventListener('resize', positionTooltip)
  })
  onBeforeUnmount(() => {
    dismissTooltip()
    window.removeEventListener('scroll', positionTooltip, true)
    window.removeEventListener('resize', positionTooltip)
  })
  return {
    setTooltipRef, tooltipAnchor, tooltipAgentId, tooltipId, tooltipText, isTooltipOpen, isTooltipVisible,
    showTooltip, hideTooltip, dismissTooltip, leaveTooltip, scheduleTooltipClose, clearTooltipTimer, onTooltipTransitionEnd,
  }
}
