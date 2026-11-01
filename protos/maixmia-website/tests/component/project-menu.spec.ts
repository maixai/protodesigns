import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ProjectMenu from '../../src/components/project-menu.vue'
import { useI18n } from '../../src/i18n'

describe('project-menu', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('opens three configuration actions and a separated danger action, restoring focus with Escape', async () => {
    useI18n().setLocale('zh-CN')
    const wrapper = mount(ProjectMenu, { props: { projectName: 'weekly-report' }, attachTo: document.body })
    const trigger = wrapper.get('.project-menu__trigger')
    await trigger.trigger('click')
    const items = wrapper.findAll('[role="menuitem"]')
    expect(items).toHaveLength(4)
    expect(items.map((item) => item.text())).toEqual(['模型', '权限', 'MCP', '关闭项目'])
    expect(items.map((item) => item.attributes('aria-label'))).toEqual([
      '模型设置：weekly-report', '权限设置：weekly-report', 'MCP 设置：weekly-report', '关闭项目：weekly-report',
    ])
    expect(wrapper.find('[role="separator"]').exists()).toBe(true)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('opens from the keyboard, roves cyclically, and supports Home and End', async () => {
    const wrapper = mount(ProjectMenu, { props: { projectName: 'weekly-report' }, attachTo: document.body })
    const trigger = wrapper.get('.project-menu__trigger')
    await trigger.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    const items = wrapper.findAll('[role="menuitem"]')
    expect(document.activeElement).toBe(items[0]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[3]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[3]?.element)
    await wrapper.get('.project-menu').trigger('keydown', { key: 'Tab' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits each configuration domain and never the danger action', async () => {
    const wrapper = mount(ProjectMenu, { props: { projectName: 'weekly-report' }, attachTo: document.body })
    const trigger = wrapper.get('.project-menu__trigger')
    for (const [index, kind] of ['model', 'permissions', 'mcp'].entries()) {
      await trigger.trigger('click')
      await wrapper.findAll('[role="menuitem"]')[index]?.trigger('click')
      expect(wrapper.emitted('configure')?.at(-1)).toEqual([kind])
      expect(wrapper.emitted('close')).toBeUndefined()
      expect(document.activeElement).toBe(trigger.element)
    }
    await trigger.trigger('click')
    await wrapper.get('[data-tone="danger"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
