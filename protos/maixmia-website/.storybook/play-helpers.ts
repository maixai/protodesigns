import { expect, waitFor } from 'storybook/test'

// 有界地等待已渲染且可交互的入口,缺失时输出选择器和 canvas,不遗留悬空观察器。
export async function visibleStoryButton(canvas: HTMLElement, selector: string): Promise<HTMLButtonElement> {
  return await waitFor(async () => {
    const button = canvas.querySelector<HTMLButtonElement>(selector)
    if (button === null) throw new Error(`Story button not found: ${selector}`)
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
    return button
  }, { container: canvas, timeout: 3000 })
}

export async function visibleStoryElement(canvas: HTMLElement, selector: string): Promise<HTMLElement> {
  return await waitFor(async () => {
    const element = canvas.querySelector<HTMLElement>(selector)
    if (element === null) throw new Error(`Story element not found: ${selector}`)
    await expect(element).toBeVisible()
    return element
  }, { container: canvas, timeout: 3000 })
}
