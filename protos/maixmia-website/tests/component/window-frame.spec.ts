import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import WindowFrame from '../../src/components/window-frame.vue'
import { RESIZE_CORNERS } from '../../src/data/window-geometry'
import type { WindowFrameApi, WindowFrameEdgeHandle } from '../../src/composables/use-window-frame'

// 悬浮窗体外观壳:只验结构(手柄数量 / 角上是否有可见抓手 / 停靠态不渲染手柄)。
// 几何与手势归 use-window-frame 的测试与 Playwright 校准,这里用最小替身把能力本体换成常量。

const EDGES: WindowFrameEdgeHandle[] = [
  { edge: 'e', orientation: 'vertical', label: '右', hint: '右', dx: 1, dy: 0 },
  { edge: 'w', orientation: 'vertical', label: '左', hint: '左', dx: -1, dy: 0 },
  { edge: 's', orientation: 'horizontal', label: '下', hint: '下', dx: 0, dy: 1 },
  { edge: 'n', orientation: 'horizontal', label: '上', hint: '上', dx: 0, dy: -1 },
]

const noop = (): void => {}

function createFrame(isDocked: boolean): WindowFrameApi {
  return {
    rootRef: ref<HTMLElement | null>(null),
    headerRef: ref<HTMLElement | null>(null),
    rectStyle: computed(() => ''),
    isDocked: computed(() => isDocked),
    hasExplicitRect: computed(() => !isDocked),
    hasFlipped: ref(false),
    isMoving: computed(() => false),
    isDragging: ref(false),
    isResizing: ref(false),
    headerHandlers: {
      pointerdown: noop,
      pointermove: noop,
      pointerup: noop,
      pointercancel: noop,
      lostpointercapture: noop,
      dblclick: noop,
      keydown: noop,
    },
    resizeEdges: computed(() => EDGES),
    resizeCorners: RESIZE_CORNERS,
    bodyId: 'test-window-body',
    onResizePointerDown: noop,
    onResizePointerMove: noop,
    onResizePointerUp: noop,
    onResizeKeydown: noop,
    ariaNow: () => 320,
    ariaMin: () => 320,
    ariaMax: () => 1200,
    currentWindowRect: () => null,
    emitRect: noop,
    resetGeometry: noop,
  }
}

function mountFrame(isDocked = false) {
  return mount(WindowFrame, {
    props: {
      frame: createFrame(isDocked),
      headerLabel: '窗口标题栏',
      headerTitle: '拖动以移动窗口',
    },
    slots: { default: '<p data-body>正文</p>' },
  })
}

describe('window-frame', () => {
  it('悬浮态渲染四边 + 四角共 8 枚手柄,且角上没有任何可见抓手', () => {
    const wrapper = mountFrame()
    expect(wrapper.findAll('.dl-window__resize')).toHaveLength(8)
    expect(wrapper.findAll('.dl-window__resize--corner')).toHaveLength(4)
    // 与设置窗体同源:静止态不画点阵抓手,四角只是透明的指针目标。
    expect(wrapper.html()).not.toContain('resize-grip')
    expect(wrapper.findAll('.dl-window__resize--corner').map((corner) => corner.element.childElementCount)).toEqual([0, 0, 0, 0])
    expect(wrapper.findAll('.dl-window__resize-grip')).toHaveLength(0)
    wrapper.unmount()
  })

  it('四边是可聚焦的分隔条,四角是纯指针便利入口', () => {
    const wrapper = mountFrame()
    const edges = wrapper.findAll('.dl-window__resize[role="separator"]')
    expect(edges).toHaveLength(4)
    for (const edge of edges) {
      expect(edge.attributes('aria-controls')).toBe('test-window-body')
      expect(edge.attributes('aria-valuenow')).toBe('320')
    }
    for (const corner of wrapper.findAll('.dl-window__resize--corner')) {
      expect(corner.element.tagName).toBe('SPAN')
      expect(corner.attributes('aria-hidden')).toBe('true')
    }
    wrapper.unmount()
  })

  it('停靠态不渲染缩放手柄', () => {
    const wrapper = mountFrame(true)
    expect(wrapper.findAll('.dl-window__resize')).toHaveLength(0)
    wrapper.unmount()
  })
})
