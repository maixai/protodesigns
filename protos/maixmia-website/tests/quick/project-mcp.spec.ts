import { expect, test } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { collectRuntimeIssues, login, waitForWorkspace } from './helpers'

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function openProjectMcp(page: Page): Promise<{ dialog: Locator; panel: Locator }> {
  await page.locator('.project-item').first().locator('.project-menu__trigger').click()
  await page.getByRole('menuitem', { name: '项目设置：weekly-report', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '项目设置 · weekly-report', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: 'MCP', exact: true }).click()
  const panel = dialog.locator('.project-mcp')
  await expect(panel.locator('.project-mcp__server')).toHaveCount(3)
  return { dialog, panel }
}

test('@area:project-mcp 项目设置三标签承载 MCP,侧栏不再保留独立入口', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await expect(page.locator('.project-row__mcp')).toHaveCount(0)
  const rowButton = page.locator('.project-item').first().locator('.project-row__button')
  const wasExpanded = await rowButton.getAttribute('aria-expanded')
  const { dialog, panel } = await openProjectMcp(page)
  await expect(rowButton).toHaveAttribute('aria-expanded', wasExpanded ?? 'false')
  await expect(dialog.locator('.project-settings__tablist').getByRole('tab')).toHaveText(['模型', '权限', 'MCP'])
  await expect(panel.locator('.agent-context[data-kind="mcp"]')).toBeVisible()
  await expect(panel.locator('[data-server-id="project:~/work/weekly-report:github"]')).toContainText('覆盖 Agent 同名')
  await expect(panel.locator('[data-server-id="project:~/work/weekly-report:playwright"]')).not.toContainText('覆盖 Agent 同名')
  await panel.locator('.agent-context__disclosure').click()
  await expect(panel.locator('.agent-context__shadowed').first()).toHaveText('被项目覆盖')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('@area:project-mcp 项目字段走底部统一保存,连接仅对干净已保存服务器即时生效', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog, panel } = await openProjectMcp(page)
  const github = panel.locator('[data-server-id="project:~/work/weekly-report:github"]')
  const connect = github.locator('.project-mcp__connection button')
  await expect(connect).toBeEnabled()
  await github.locator('.project-mcp__fields input').nth(1).fill('GitHub Project')
  await expect(connect).toBeDisabled()
  await expect(github.locator('.project-mcp__connection')).toContainText('先保存配置')
  await expect(dialog.locator('.project-settings__tablist').getByRole('tab', { name: 'MCP · 有未保存的更改', exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await expect(connect).toBeEnabled()
  await connect.click()
  await expect(github.locator('.project-mcp__server-head')).toContainText('已连接')

  await github.locator('.project-mcp__fields input').nth(1).fill('GitHub Renamed')
  await page.keyboard.press('Escape')
  const confirm = page.getByRole('alertdialog', { name: '有未保存的更改', exact: true })
  await expect(confirm).toContainText('MCP')
  await expect(confirm.getByRole('button', { name: '继续编辑', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '放弃更改并关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('@area:project-mcp 添加服务器只进入当前标签草稿,切标签不丢失', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog, panel } = await openProjectMcp(page)
  await panel.locator('.project-mcp__section-head button').click()
  const form = panel.locator('.project-mcp__add')
  await form.locator('input').nth(0).fill('linear')
  await form.locator('input').nth(2).fill('npx -y @example/linear')
  await form.getByRole('button', { name: '添加服务器', exact: true }).click()
  await expect(panel.locator('.project-mcp__server')).toHaveCount(4)
  await dialog.getByRole('tab', { name: '模型', exact: true }).click()
  await expect(dialog.locator('.project-settings__tablist').getByRole('tab', { name: 'MCP · 有未保存的更改', exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: 'MCP · 有未保存的更改', exact: true }).click()
  await expect(panel.locator('.project-mcp__server')).toHaveCount(4)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
})

test('@area:project-mcp 项目 MCP 面板在四档视口无横向溢出', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openProjectMcp(page)
  for (const width of [375, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    const content = dialog.locator('.project-settings__content')
    expect(await content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  }
  expect(issues).toEqual([])
})
