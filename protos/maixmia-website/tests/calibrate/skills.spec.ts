import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Skill } from '../../src/contracts/generated/skill'
import { filterSkills, insertSkillIntoDraft } from '../../src/data/skills'

// Skill 只通过输入框的 `/` 菜单触达;侧栏项目区只显示文件。本规格验证菜单、键盘与发送投影。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function login(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#workspace-composer-weekly')).not.toHaveAttribute('readonly', '')
}

async function openSlash(page: Page): Promise<void> {
  const input = page.locator('#workspace-composer-weekly')
  await input.fill('')
  // fill('') 时若已有前导 `/`,草稿仍是 `/`;先在开头 Backspace 撤掉前缀,再触发 slash。
  await input.press('Home')
  await input.press('Backspace')
  await input.pressSequentially('/')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(page.getByRole('listbox', { name: '选择 Skill' })).toBeVisible()
  // 等 Skill 清单加载落定(菜单计数从 — 变成 5),后续过滤断言才稳定。
  await expect(page.locator('.skill-menu__count')).toHaveText('5')
}

test('slash 键帽替代输入字符,菜单向上锚定,过滤后 Tab 确认', async ({ page }, testInfo) => {
  await login(page)
  await openSlash(page)
  const input = page.locator('#workspace-composer-weekly')
  const list = page.getByRole('listbox', { name: '选择 Skill' })
  const form = await page.locator('.composer-form').boundingBox()
  const menu = await page.locator('.skill-menu').boundingBox()
  expect(form).not.toBeNull()
  expect(menu).not.toBeNull()
  if (form === null || menu === null) throw new Error('Missing skill menu geometry')
  expect(menu.y + menu.height).toBeLessThanOrEqual(form.y)
  await input.pressSequentially('weekly')
  await expect(input).toHaveValue('weekly')
  await expect(list.getByRole('option')).toHaveCount(1)
  await expect(page.locator('.skill-menu__count')).toHaveText('1/5')
  await page.screenshot({ path: testInfo.outputPath('skills-menu-filtered-1280.png') })
  await input.press('Tab')
  // 前导 `/` 由键帽图标渲染,textarea 里只剩命令与参数;图标在选定后仍保持。
  await expect(input).toHaveValue('weekly-status ')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(input).toBeFocused()
  await expect(list).toHaveCount(0)
  await expect(page.locator('.workspace-live')).toHaveText('已选择 /weekly-status')
})

test('方向键循环与 Enter 选中第二项,Esc 保留命令并保持键帽', async ({ page }) => {
  await login(page)
  await openSlash(page)
  const input = page.locator('#workspace-composer-weekly')
  const options = page.getByRole('listbox', { name: '选择 Skill' }).getByRole('option')
  const command = (await options.nth(1).locator('.skill-menu__command').innerText()).trim()
  await input.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(input).toHaveAttribute('aria-activedescendant', /option-1$/)
  await input.press('Enter')
  await expect(input).toHaveValue(`${command.replace(/^\//u, '')} `)
  await expect(page.locator('.composer-slash')).toBeVisible()
  await openSlash(page)
  await input.pressSequentially('rel')
  await input.press('Escape')
  await expect(input).toHaveValue('rel')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(page.locator('.skill-menu')).toHaveCount(0)
})

test('空查询 Backspace 清空,空匹配 Tab 不移动焦点,Enter 退出但不发送', async ({ page }) => {
  await login(page)
  const input = page.locator('#workspace-composer-weekly')
  await openSlash(page)
  await input.press('Backspace')
  await expect(input).toHaveValue('')
  await expect(page.locator('.composer-slash')).toHaveCount(0)
  await expect(page.locator('.skill-menu')).toHaveCount(0)
  await openSlash(page)
  await input.pressSequentially('no-such-skill')
  await expect(page.locator('.skill-menu')).toContainText('没有匹配的 Skill')
  await expect(page.getByRole('listbox', { name: '选择 Skill' })).toBeAttached()
  await input.press('Tab')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('no-such-skill')
  await input.press('Enter')
  await expect(input).toHaveValue('no-such-skill')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(page.locator('.chat-message')).toHaveCount(4)
  await openSlash(page)
  await input.pressSequentially('weekly ')
  await expect(input).toHaveValue('weekly ')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(page.locator('.skill-menu')).toHaveCount(0)
})

for (const width of [375, 768, 1600]) {
  test(`slash 菜单 @${width}:不横向溢出且始终在输入卡片上方`, async ({ page }, testInfo) => {
    await login(page)
    await page.setViewportSize({ width, height: 900 })
    await openSlash(page)
    const geometry = await page.locator('.composer-form').evaluate((form) => {
      const menu = form.querySelector('.skill-menu')?.getBoundingClientRect()
      return { top: form.getBoundingClientRect().top, bottom: menu?.bottom ?? Number.POSITIVE_INFINITY, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.top)
    expect(geometry.overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: testInfo.outputPath(`skills-menu-${width}.png`) })
  })
}

test('Skill 纯函数:检索优先级、项目优先与草稿替换', () => {
  const skills: Skill[] = [
    { id: 'plugin', command: 'review:code', name: 'review', description: 'weekly quality', scope: 'agentPlugin', sourceName: 'Review' },
    { id: 'project', command: 'weekly-status', name: 'weekly status', description: 'progress', scope: 'project', sourceName: '' },
  ]
  expect(filterSkills(skills, ' WEEKLY ').map((skill) => skill.id)).toEqual(['project', 'plugin'])
  expect(filterSkills(skills, '').map((skill) => skill.id)).toEqual(['project', 'plugin'])
  expect(insertSkillIntoDraft('/old 参数', 'weekly-status')).toBe('/weekly-status 参数')
  expect(insertSkillIntoDraft('正文', 'weekly-status')).toBe('/weekly-status 正文')
  expect(insertSkillIntoDraft('  ', 'weekly-status')).toBe('/weekly-status ')
  expect(insertSkillIntoDraft('/', 'weekly-status')).toBe('/weekly-status ')
})
