import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Skill } from '../../src/contracts/generated/skill'
import { filterSkills, insertSkillIntoDraft } from '../../src/data/skills'

// 独立于像素基线,验证 Skill 来源、输入投影与键盘状态流转。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function login(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('#project-content-weekly-report-tab-files')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#project-tree-weekly-report .project-skills')).toHaveAttribute('data-status', 'ready')
  await expect(page.locator('#workspace-composer-weekly')).not.toHaveAttribute('readonly', '')
}

// 项目内容默认在「文件」;测试要读 Skill 行时先切到 Skills 栏。
async function openSkillsTab(page: Page, projectId = 'weekly-report'): Promise<void> {
  const tab = page.locator(`#project-content-${projectId}-tab-skills`)
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator(`#project-content-${projectId}-panel-skills`)).toBeVisible()
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
}

test('侧栏项目内容 tab:默认文件、Skills 计数常驻;切换后来源明确', async ({ page }) => {
  await login(page)
  const filesTab = page.locator('#project-content-weekly-report-tab-files')
  const skillsTab = page.locator('#project-content-weekly-report-tab-skills')
  // 默认 = 最高频的文件栏;Skills 的计数常驻可见,不靠用户先知道 `/`。
  await expect(filesTab).toContainText('文件')
  await expect(filesTab.locator('.view-tabs__count')).toHaveText('23')
  await expect(skillsTab).toContainText('Skills')
  await expect(skillsTab.locator('.view-tabs__count')).toHaveText('5')
  await expect(page.locator('#project-content-weekly-report-panel-files')).toBeVisible()
  await expect(page.locator('#project-content-weekly-report-panel-skills')).toBeHidden()

  await openSkillsTab(page)
  const group = page.locator('#project-content-weekly-report-panel-skills .project-skills')
  const project = group.getByRole('button', { name: '把 Skill「weekly-status」插入当前对话', exact: true })
  const plugin = group.getByRole('button', { name: '把 Skill「code-review:review-diff」插入当前对话', exact: true })
  await expect(project).toBeVisible()
  await expect(project.locator('.project-skills__source')).toHaveText('项目')
  await expect(plugin).toBeVisible()
  await expect(plugin.locator('.project-skills__source')).toHaveText('插件')
  await expect(plugin.locator('.project-skills__description')).toContainText('Code Review · ')

  // 切回文件:v-show 保留树,展开状态不丢。
  await filesTab.click()
  await expect(filesTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#project-content-weekly-report-panel-files')).toBeVisible()
  await expect(page.locator('#project-content-weekly-report-panel-files .entry-list')).toBeVisible()
})

test('项目内容 tab 键盘:→/←/Home/End 循环并自动切换面板', async ({ page }) => {
  await login(page)
  const filesTab = page.locator('#project-content-weekly-report-tab-files')
  const skillsTab = page.locator('#project-content-weekly-report-tab-skills')
  await filesTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(skillsTab).toBeFocused()
  await expect(skillsTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#project-content-weekly-report-panel-skills')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(filesTab).toBeFocused()
  await expect(filesTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(skillsTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(filesTab).toHaveAttribute('aria-selected', 'true')
})

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

test('方向键循环与 Enter 选中第二项,Esc 保留字面命令', async ({ page }) => {
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

test('侧栏插入同项目可见对话,聚焦输入框并把光标放到末尾', async ({ page }) => {
  await login(page)
  await openSkillsTab(page)
  const input = page.locator('#workspace-composer-weekly')
  await page.getByRole('button', { name: '把 Skill「weekly-status」插入当前对话', exact: true }).click()
  await expect(input).toHaveValue('weekly-status ')
  await expect(page.locator('.composer-slash')).toBeVisible()
  await expect(input).toBeFocused()
  expect(await input.evaluate((element) => element instanceof HTMLTextAreaElement ? element.selectionStart : -1)).toBe('weekly-status '.length)
  await input.fill('release-check 保留的参数')
  await expect(page.locator('.composer-slash'), '编辑参数时前缀图标仍在').toBeVisible()
  await page.getByRole('button', { name: '把 Skill「weekly-status」插入当前对话', exact: true }).click()
  await expect(input).toHaveValue('weekly-status 保留的参数')
  await openSlash(page)
  await page.getByRole('button', { name: '把 Skill「weekly-status」插入当前对话', exact: true }).click()
  await expect(page.locator('.skill-menu')).toHaveCount(0)
  await expect(input).toHaveValue('weekly-status ')
  await expect(page.locator('.composer-slash')).toBeVisible()
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

test('项目内容 tab 与 Skills 行:密集行档触达;抽屉内 Skill 行回到 44', async ({ page }) => {
  await login(page)
  const filesTab = page.locator('#project-content-weekly-report-tab-files')
  const skillsTab = page.locator('#project-content-weekly-report-tab-skills')
  // 横向 tab 条:整枚 tab 是 button,高 24(发丝轨道总高 26);相邻中心距 = 半宽之和,天然 > 24。
  const filesBox = await filesTab.boundingBox()
  const skillsBox = await skillsTab.boundingBox()
  expect(filesBox?.height ?? 0, '项目内容 tab 高度 ≥24').toBeGreaterThanOrEqual(24)
  expect(skillsBox?.height ?? 0, '项目内容 tab 高度 ≥24').toBeGreaterThanOrEqual(24)

  await openSkillsTab(page)
  const boxes = await page.locator('#project-content-weekly-report-panel-skills .project-skills__row').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  }))
  expect(boxes.length, 'weekly-report 至少有多个 Skill').toBeGreaterThan(1)
  for (const box of boxes) expect(box.height, '整行 button 高度 ≥24').toBeGreaterThanOrEqual(24)
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1]
    const current = boxes[index]
    if (previous === undefined || current === undefined) continue
    const centreDistance = Math.abs((current.top + current.height / 2) - (previous.top + previous.height / 2))
    expect(centreDistance, '相邻 Skills 行中心距 ≥24(WCAG 2.5.8 间距替代)').toBeGreaterThanOrEqual(24)
  }
  // ≤1023 侧栏收成抽屉、进入触屏语境:Skill 行回到 44;tab 条是横向密集行,任何宽度都保持 28。
  await page.setViewportSize({ width: 375, height: 900 })
  await page.getByRole('button', { name: '打开侧栏' }).click()
  const drawerRow = await page.locator('#project-content-weekly-report-panel-skills .project-skills__row').first().boundingBox()
  const drawerTab = await page.locator('#project-content-weekly-report-tab-skills').boundingBox()
  expect(drawerRow?.height ?? 0, '抽屉 Skill 行 44').toBeGreaterThanOrEqual(44)
  expect(drawerTab?.height ?? 0, '抽屉内 tab 仍是横向密集行(≥24)').toBeGreaterThanOrEqual(24)
})

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
