import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ProjectMenu from '../../src/components/project-menu.vue'
import { useI18n } from '../../src/i18n'

// 菜单结构:只有「设置」与「关闭项目」两个一级项;「设置」直接打开统一设置窗体,没有子菜单。
// 键盘语义按 APG menu:方向键在当前层漫游,Home / End 到首末项,Esc 关闭并归还焦点。

async function mountMenu(): Promise<VueWrapper> {
  useI18n().setLocale('zh-CN')
  return mount(ProjectMenu, { props: { projectName: 'weekly-report' }, attachTo: document.body })
}

async function openMenu(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.project-menu__trigger').trigger('click')
  await flushPromises()
}

describe('project-menu', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('只有「设置」与「关闭项目」两项,设置不再展开子菜单', async () => {
    const wrapper = await mountMenu()
    await openMenu(wrapper)

    const items = wrapper.findAll('.project-menu__item')
    expect(items).toHaveLength(2)
    expect(items.map((item) => item.text())).toEqual(['设置', '关闭项目'])
    expect(items.map((item) => item.attributes('aria-label'))).toEqual([
      '项目设置：weekly-report', '关闭项目：weekly-report',
    ])
    expect(wrapper.find('[role="separator"]').exists()).toBe(true)
    expect(wrapper.find('[role="menu"] [role="menu"]').exists()).toBe(false)

    const settings = items[0]
    // 直接动作,不是 disclosure:没有 aria-haspopup / aria-expanded。
    expect(settings?.attributes('aria-haspopup')).toBeUndefined()
    expect(settings?.attributes('aria-expanded')).toBeUndefined()

    wrapper.unmount()
  })

  it('键盘:方向键漫游、Home/End、Esc 关闭并把焦点还给 ⋯', async () => {
    const wrapper = await mountMenu()
    const trigger = wrapper.get('.project-menu__trigger')
    await trigger.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    const items = wrapper.findAll('.project-menu__item')
    expect(document.activeElement).toBe(items[0]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[1]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0]?.element)
    // 首项再向上回绕到末项。
    await wrapper.get('.project-menu').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[1]?.element)

    await wrapper.get('.project-menu').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.project-menu__popover').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    wrapper.unmount()
  })

  it('Tab 关闭整个菜单,不困住焦点', async () => {
    const wrapper = await mountMenu()
    await openMenu(wrapper)
    expect(wrapper.find('.project-menu__popover').exists()).toBe(true)

    await wrapper.get('.project-menu').trigger('keydown', { key: 'Tab' })
    await flushPromises()
    expect(wrapper.find('.project-menu__popover').exists()).toBe(false)

    wrapper.unmount()
  })

  it('点「设置」只 emit configure,关闭菜单并归还焦点;危险动作永不进 configure', async () => {
    const wrapper = await mountMenu()
    await openMenu(wrapper)
    await wrapper.findAll('.project-menu__item')[0]?.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('configure')).toHaveLength(1)
    expect(wrapper.emitted('configure')?.[0]).toEqual([])
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('.project-menu__popover').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.project-menu__trigger').element)

    await openMenu(wrapper)
    await wrapper.get('[data-tone="danger"]').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('configure')).toHaveLength(1)

    wrapper.unmount()
  })

  it('外部 pointerdown 关闭整个菜单', async () => {
    const wrapper = await mountMenu()
    await openMenu(wrapper)
    expect(wrapper.find('.project-menu__popover').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('.project-menu__popover').exists()).toBe(false)

    wrapper.unmount()
  })
})
