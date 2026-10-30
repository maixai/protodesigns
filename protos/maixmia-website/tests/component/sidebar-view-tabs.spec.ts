import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SidebarViewTabs from '../../src/components/sidebar-view-tabs.vue'

const options = [
  { id: 'projects', label: '项目', count: 2 },
  { id: 'plugins', label: '插件', count: 1 },
] as const

describe('sidebar-view-tabs', () => {
  it('renders tablist semantics and counts', () => {
    const wrapper = mount(SidebarViewTabs, {
      props: { label: '侧栏视图', idPrefix: 'test', options, modelValue: 'projects' },
    })
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('侧栏视图')
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]?.attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('1')
  })

  it('emits update:modelValue on click and ArrowRight', async () => {
    const wrapper = mount(SidebarViewTabs, {
      props: { label: '侧栏视图', idPrefix: 'test', options, modelValue: 'projects' },
    })
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['plugins'])
    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['plugins'])
  })
})
