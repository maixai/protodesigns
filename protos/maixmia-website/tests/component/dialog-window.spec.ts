import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DialogWindow from '../../src/components/dialog-window.vue'
import { useI18n } from '../../src/i18n'

// 共享模态外壳:几何 / 拖动 / 缩放 / 模态请求。showModal 在 happy-dom 里没有实现,
// 与账户窗体测试一样用最小替身记录开合状态。
function mountDialog(open = true): VueWrapper {
  return mount(DialogWindow, {
    attachTo: document.body,
    props: { open, tier: 'regular', layout: 'stacked', bodyId: 'test-dialog-body' },
    slots: {
      header: '<h2>测试窗体</h2>',
      nav: '<div role="tablist">导航</div>',
      default: '<p data-body>正文</p>',
      actions: '<button type="button">保存</button>',
    },
  })
}

function frameElement(wrapper: VueWrapper): HTMLDialogElement {
  const element = wrapper.element
  if (!(element instanceof HTMLDialogElement)) throw new Error('dialog root missing')
  return element
}

// 最大化 / 还原已从设置窗体移除:标题栏内不应再出现承担该语义的按钮。
function hasMaximizeControl(wrapper: VueWrapper): boolean {
  return wrapper.get('.dl-dialog__header').findAll('button').some((button) => {
    const label = button.attributes('aria-label') ?? ''
    return label.includes('最大化') || label.includes('还原')
  })
}

beforeEach(() => {
  useI18n().setLocale('zh-CN')
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.open = true
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.open = false
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('dialog-window', () => {
  it('打开时进入原生模态,并暴露标题栏与缩放手柄', async () => {
    const wrapper = mountDialog()
    await nextTick()
    const dialog = frameElement(wrapper)
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(wrapper.get('.dl-dialog__header').attributes('aria-label')).toBe('窗口标题栏')
    // 最大化控制已移除:头部只剩业务槽给出的动作钮。
    expect(hasMaximizeControl(wrapper)).toBe(false)
    expect(dialog.hasAttribute('data-window-controls')).toBe(false)
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(4)
    expect(wrapper.findAll('.dl-dialog__resize--corner')).toHaveLength(4)
    wrapper.unmount()
  })

  it('静止态右下角没有任何常驻抓手或角标', async () => {
    const wrapper = mountDialog()
    await nextTick()
    // 旧的点阵抓手已移除:角上只剩隐形的指针目标,不含任何可见子元素。
    expect(wrapper.findAll('.dl-dialog__resize-grip')).toHaveLength(0)
    expect(wrapper.findAll('.dl-dialog__resize--corner').map((corner) => corner.element.childElementCount)).toEqual([0, 0, 0, 0])
    wrapper.unmount()
  })

  it('标题栏双击不改变几何', async () => {
    const wrapper = mountDialog()
    await nextTick()
    const dialog = frameElement(wrapper)
    const before = { left: dialog.style.left, top: dialog.style.top, width: dialog.style.width, height: dialog.style.height }
    await wrapper.get('.dl-dialog__header').trigger('dblclick')
    await nextTick()
    expect(dialog.style.left).toBe(before.left)
    expect(dialog.style.top).toBe(before.top)
    expect(dialog.style.width).toBe(before.width)
    expect(dialog.style.height).toBe(before.height)
    wrapper.unmount()
  })

  it('缩放手柄的方向键调整尺寸;Home 到最小宽度', async () => {
    const wrapper = mountDialog()
    await nextTick()
    const dialog = frameElement(wrapper)
    const initial = Number.parseFloat(dialog.style.width)
    const east = wrapper.findAll('[role="separator"]').find((handle) => handle.attributes('aria-label') === '调整窗口宽度(右缘)')
    expect(east).toBeDefined()
    await east?.trigger('keydown', { key: 'ArrowRight' })
    expect(Number.parseFloat(dialog.style.width)).toBeGreaterThan(initial)
    await east?.trigger('keydown', { key: 'Home' })
    expect(Number.parseFloat(dialog.style.width)).toBe(320)
    wrapper.unmount()
  })

  it('Esc 交给业务决定;嵌套子层的 cancel 不触发关闭请求', async () => {
    const wrapper = mountDialog()
    await nextTick()
    const dialog = wrapper.get('dialog')
    await wrapper.get('.dl-dialog__header').trigger('cancel', { bubbles: true })
    expect(wrapper.emitted('request-close')).toBeUndefined()
    await dialog.trigger('cancel')
    expect(wrapper.emitted('request-close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('窄屏退化为固定 sheet:不提供缩放手柄与窗口操作', async () => {
    const original = window.innerWidth
    window.innerWidth = 375
    const wrapper = mountDialog()
    await nextTick()
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(hasMaximizeControl(wrapper)).toBe(false)
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(0)
    expect(wrapper.get('dialog').classes()).toContain('is-static')
    expect(wrapper.get('.dl-dialog__header').attributes('tabindex')).toBe('-1')
    window.innerWidth = original
    wrapper.unmount()
  })
})
