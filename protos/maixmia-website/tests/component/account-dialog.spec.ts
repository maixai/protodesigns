import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AccountSecurityDialog from '../../src/components/account-security-dialog.vue'
import * as workspaceApi from '../../src/api/workspace'
import { mockDeviceUnlockCapability, mockIdentityVault } from '../../src/mocks/identity'

// 账户弹窗内的文件选择器与嵌套确认框都是原生 dialog 子元素：
// 它们的 cancel 事件会冒泡，不能因此把整个账户设置关掉。
async function openDialog() {
  const wrapper = mount(AccountSecurityDialog, { attachTo: document.body })
  await flushPromises()
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false })
  vi.spyOn(workspaceApi, 'getIdentityVault').mockResolvedValue({ ok: true, value: mockIdentityVault() })
  vi.spyOn(workspaceApi, 'getDeviceUnlockCapability').mockResolvedValue({ ok: true, value: mockDeviceUnlockCapability() })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('account security dialog cancel handling', () => {
  it('文件选择器取消只还焦，不关闭账户弹窗；窗体自身的 Esc 仍关闭', async () => {
    const wrapper = await openDialog()
    const dialog = wrapper.get('dialog')
    const avatarInput = wrapper.get('[data-avatar-input]')
    const avatarButton = wrapper.get('[data-avatar-button]')

    expect(dialog.element.open).toBe(true)
    await avatarInput.trigger('cancel', { bubbles: true })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(dialog.element.open).toBe(true)
    expect(document.activeElement).toBe(avatarButton.element)

    await dialog.trigger('cancel')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(dialog.element.open).toBe(false)
    wrapper.unmount()
  })

  it('子元素的 cancel 冒泡到窗体时不再触发关闭', async () => {
    const wrapper = await openDialog()
    const dialog = wrapper.get('dialog')
    await wrapper.get('.account-security__header').trigger('cancel', { bubbles: true })
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(dialog.element.open).toBe(true)
    wrapper.unmount()
  })
})
