import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'

// tests/quick 的最小登录与就绪辅助:
// 只保留日常快检需要的路径,不复制 calibrate 里的视觉/几何等待逻辑。
export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await unlockDemoIdentity(page)
  await expect(page).toHaveURL(/#\/workspace$/)
}

export async function waitForWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('把项目周报整理成行动清单')
}

// 收集运行时问题:未捕获异常、console error、失败请求。
// 与 tests/smoke 同源,但这里只覆盖本次改动涉及的页面,不重复全站遍历。
export function collectRuntimeIssues(page: Page): string[] {
  const issues: string[] = []
  page.on('pageerror', (error) => { issues.push(`uncaught error: ${error.message}`) })
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console.error: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => { issues.push(`request failed: ${request.url()}`) })
  return issues
}
