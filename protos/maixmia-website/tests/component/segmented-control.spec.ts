import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SegmentedControl from '../../src/components/segmented-control.vue'

const options = [
  { id: 'projects', label: '项目' },
  { id: 'plugins', label: '插件' },
] as const

describe('segmented-control', () => {
  it('renders a radiogroup with one checked option', () => {
    const wrapper = mount(SegmentedControl, {
      props: { label: '侧栏视图', options, modelValue: 'projects' },
    })
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe('侧栏视图')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0]?.attributes('aria-checked')).toBe('true')
    expect(radios[0]?.attributes('tabindex')).toBe('0')
    expect(radios[1]?.attributes('tabindex')).toBe('-1')
  })

  it('emits update:modelValue on click', async () => {
    const wrapper = mount(SegmentedControl, {
      props: { label: '侧栏视图', options, modelValue: 'projects' },
    })
    await wrapper.findAll('[role="radio"]')[1]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['plugins'])
  })

  it('emits the next option on ArrowRight and wraps with Home/End', async () => {
    const wrapper = mount(SegmentedControl, {
      props: { label: '侧栏视图', options, modelValue: 'projects' },
    })
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['plugins'])
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'End' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['plugins'])
    await wrapper.get('[role="radiogroup"]').trigger('keydown', { key: 'Home' })
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual(['projects'])
  })
})
