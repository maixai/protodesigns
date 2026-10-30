import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ProjectMenu from '../../src/components/project-menu.vue'

describe('project-menu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens the menu and closes it with Escape, restoring focus', async () => {
    const wrapper = mount(ProjectMenu, {
      props: { projectName: 'weekly-report' },
      attachTo: document.body,
    })
    const trigger = wrapper.get('.project-menu__trigger')
    await trigger.trigger('click')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('true')
    await wrapper.get('.project-menu').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it('emits close when the danger action is clicked', async () => {
    const wrapper = mount(ProjectMenu, {
      props: { projectName: 'weekly-report' },
      attachTo: document.body,
    })
    await wrapper.get('.project-menu__trigger').trigger('click')
    await wrapper.get('[role="menuitem"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
