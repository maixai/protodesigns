import { describe, expect, it } from 'vitest'
import {
  DIALOG_HEIGHT_RATIO,
  clampDialogRect,
  defaultDialogRect,
} from '../../src/data/window-geometry'
import type { DialogSizePolicy } from '../../src/data/window-geometry'

function policy(width: number, height: number, maxWidth = 1120): DialogSizePolicy {
  return {
    box: { width, height },
    margin: 16,
    maxWidth,
    maxHeight: 900,
    minWidth: 320,
    minHeight: 320,
    heightRatio: DIALOG_HEIGHT_RATIO,
  }
}

describe('dialog geometry', () => {
  it('默认几何 = 内容等级宽度上限与视口九成高度,居中', () => {
    expect(defaultDialogRect(policy(1280, 900))).toEqual({ x: 80, y: 45, w: 1120, h: 810 })
    expect(defaultDialogRect(policy(1280, 900, 720))).toEqual({ x: 280, y: 45, w: 720, h: 810 })
  })

  it('短视口与超宽屏都收在共享策略内', () => {
    expect(defaultDialogRect(policy(375, 400))).toEqual({ x: 16, y: 20, w: 343, h: 360 })
    expect(defaultDialogRect(policy(1600, 1100)).h).toBe(900)
    expect(defaultDialogRect(policy(1600, 1100)).w).toBe(1120)
  })

  it('视口变化后的标准几何被重新钳进边界', () => {
    const clamped = clampDialogRect({ x: 900, y: 700, w: 1120, h: 810 }, policy(1280, 900))
    expect(clamped.w).toBe(1120)
    expect(clamped.h).toBe(810)
    expect(clamped.x).toBeLessThanOrEqual(1280 - 16 - 1120)
    expect(clamped.y).toBeLessThanOrEqual(900 - 16 - 810)
  })
})
