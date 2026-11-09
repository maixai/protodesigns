import { afterEach, describe, expect, it } from 'vitest'
import { visibleStoryButton, visibleStoryElement } from '../../.storybook/play-helpers'

afterEach(() => { document.body.innerHTML = '' })

describe('bounded story play controls', () => {
  it('returns the visible enabled button instead of an optional no-op click', async () => {
    const canvas = document.createElement('section')
    const button = document.createElement('button')
    button.className = 'story-action'
    canvas.append(button)
    document.body.append(canvas)
    expect(await visibleStoryButton(canvas, '.story-action')).toBe(button)
    expect(await visibleStoryElement(canvas, '.story-action')).toBe(button)
  })
  it('waits for the component to reveal and enable its control', async () => {
    const canvas = document.createElement('section')
    const button = document.createElement('button')
    button.hidden = true
    button.disabled = true
    canvas.append(button)
    document.body.append(canvas)
    const pending = visibleStoryButton(canvas, 'button')
    queueMicrotask(() => { button.hidden = false; button.disabled = false })
    expect(await pending).toBe(button)
  })
  it('rejects a missing control with its selector instead of hanging until the story timeout', async () => {
    const canvas = document.createElement('section')
    document.body.append(canvas)
    await expect(visibleStoryButton(canvas, '[data-missing="server"]')).rejects.toThrow('Story button not found: [data-missing="server"]')
  })
})
