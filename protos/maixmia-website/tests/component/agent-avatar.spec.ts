import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentEditorDialog from '../../src/components/agent-editor-dialog.vue'
import AgentContextSwitcher from '../../src/components/agent-context-switcher.vue'
import { agentInitial } from '../../src/components/agent-avatar'
import * as avatarReader from '../../src/components/account-avatar'
import { mockAgentSummaries, mockCreateAgent, mockUpdateAgent, mockDeleteAgent } from '../../src/mocks/workspace'
import type { AgentConfig } from '../../src/contracts/generated/agent-config'
import type { AgentSummary } from '../../src/contracts/generated/agent-summary'
import { mockUnlockIdentity, mockLockIdentity } from '../../src/mocks/identity'
import { mockCreatePairing, mockAgentPairingSecret, mockConnectPairingLink, mockRequestPairingApproval, mockAllowPairing, mockConfirmPairing } from '../../src/mocks/pairing'

const AVATAR_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const OTHER_AVATAR_URL = `${AVATAR_URL}#other`
function agentFixture(): AgentSummary {
  const agent = mockAgentSummaries()[0]
  if (agent === undefined) throw new Error('Missing agent fixture')
  return agent
}
async function editor(agent = agentFixture()) {
  const wrapper = mount(AgentEditorDialog, {
    props: { open: false, focusIdentity: false, agent, canDelete: false, busy: false, error: '', savedToken: 0 },
    attachTo: document.body,
    shallow: true,
    global: { renderStubDefaultSlot: true },
  })
  await flushPromises()
  await wrapper.setProps({ open: true })
  await flushPromises()
  await wrapper.get('[role="tab"][id$="-tab-basic"]').trigger('click')
  return wrapper
}
async function selectImage(wrapper: Awaited<ReturnType<typeof editor>>): Promise<void> {
  const input = wrapper.get<HTMLInputElement>('[data-testid="agent-avatar-input"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['image'], 'avatar.png', { type: 'image/png' })] })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('agent avatar', () => {
  it('沿用单首字与大小写，并完整保留代理对', () => {
    for (const [name, initial] of [['规划助手', '规'], ['Alice Smith', 'A'], ['alice', 'a'], ['𠮷野', '𠮷'], ['😀助手', '😀'], ['', '']]) {
      expect(agentInitial(name ?? '')).toBe(initial)
    }
  })

  it('切换器从各自摘要渲染图片，不改变状态点或选择事件', async () => {
    const first = { ...agentFixture(), avatarUrl: AVATAR_URL }
    const second = { ...first, id: 'second', name: '𠮷野', avatarUrl: '' }
    const wrapper = mount(AgentContextSwitcher, { props: { value: first.id, agents: [first, second], variant: 'sidebar' } })
    expect(wrapper.get('.agent-context-switcher__mark img').attributes('src')).toBe(AVATAR_URL)
    expect(wrapper.find('.agent-context-switcher__mark .agent-context-switcher__status-dot').exists()).toBe(true)
    await wrapper.get('.agent-context-switcher__trigger').trigger('click')
    expect(wrapper.findAll('.agent-context-switcher__option-mark img')).toHaveLength(1)
    expect(wrapper.get('[data-agent="second"] .agent-context-switcher__option-mark').text()).toBe('𠮷')
    await wrapper.get('.agent-context-switcher__option[data-agent="second"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['second']])
    wrapper.unmount()
  })

  it('资料行使用可见标签与程序关联，忙碌时禁用，修改仍随保存提交', async () => {
    const agent = agentFixture()
    const wrapper = await editor(agent)
    const nameInput = wrapper.get('.agent-editor__profile-name')
    const noteInput = wrapper.get('.agent-editor__profile-note')
    const nameLabel = wrapper.get(`label[for="${nameInput.attributes('id')}"]`)
    const noteLabel = wrapper.get(`label[for="${noteInput.attributes('id')}"]`)
    expect(nameLabel.text()).toBe('Name')
    expect(noteLabel.text()).toBe('Note')
    expect(nameInput.attributes('aria-label')).toBeUndefined()
    expect(noteInput.attributes('aria-label')).toBeUndefined()
    expect(wrapper.find('[id$="-avatar-hint"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="agent-avatar-input"]').attributes('aria-label')).toBe('Avatar')
    expect(wrapper.find('.agent-editor__avatar-feedback').exists()).toBe(false)
    await wrapper.get('.agent-editor__profile-name').setValue('协作规划官')
    await wrapper.get('.agent-editor__profile-note').setValue('负责每周计划与交付跟踪')
    expect(wrapper.get('.agent-editor__agent-name').text()).toBe(agent.name)
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('dirty')
    await wrapper.get('.agent-editor__save-button').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: '协作规划官', note: '负责每周计划与交付跟踪' })
    await wrapper.setProps({ busy: true })
    for (const selector of ['.agent-editor__profile-name', '.agent-editor__profile-note', '[data-testid="agent-avatar-button"]']) {
      expect(wrapper.get(selector).attributes('disabled')).toBeDefined()
    }
    wrapper.unmount()
  })

  it('文件选择器取消不关闭设置弹窗，Esc 仍取消', async () => {
    const wrapper = await editor()
    // 原生 file input 的 cancel 会冒泡；它只应还焦，不应把整个设置弹窗关掉。
    await wrapper.get('[data-testid="agent-avatar-input"]').trigger('cancel', { bubbles: true })
    expect(wrapper.emitted('cancel')).toBeUndefined()
    expect(wrapper.get('dialog').element.open).toBe(true)
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('移除与选回原图恢复干净；保存失败保留草稿；成功后才推进头部与基线', async () => {
    const agent = { ...agentFixture(), avatarUrl: AVATAR_URL }
    const read = vi.spyOn(avatarReader, 'readAccountAvatar').mockResolvedValue({ ok: true, value: AVATAR_URL })
    const wrapper = await editor(agent)
    await wrapper.get('.agent-editor__avatar-remove').trigger('click')
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('dirty')
    expect(wrapper.get('.agent-editor__avatar-mark img').attributes('src')).toBe(AVATAR_URL)
    await selectImage(wrapper)
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('clean')
    read.mockResolvedValue({ ok: true, value: OTHER_AVATAR_URL })
    await selectImage(wrapper)
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('dirty')
    await wrapper.get('.agent-editor__save-button').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ avatarUrl: OTHER_AVATAR_URL })
    await wrapper.setProps({ error: 'Save failed' })
    expect(wrapper.get('[data-testid="agent-avatar-button"] img').attributes('src')).toBe(OTHER_AVATAR_URL)
    expect(wrapper.get('.agent-editor__avatar-mark img').attributes('src')).toBe(AVATAR_URL)
    await wrapper.setProps({ error: '', agent: { ...agent, avatarUrl: OTHER_AVATAR_URL }, savedToken: 1 })
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('saved')
    expect(wrapper.get('.agent-editor__avatar-mark img').attributes('src')).toBe(OTHER_AVATAR_URL)
    wrapper.unmount()
  })

  it('所有读取错误保留原图、不置脏，并还焦和播报', async () => {
    const agent = { ...agentFixture(), avatarUrl: AVATAR_URL }
    const read = vi.spyOn(avatarReader, 'readAccountAvatar')
    const wrapper = await editor(agent)
    for (const error of ['type', 'size', 'read']) {
      if (error !== 'type' && error !== 'size' && error !== 'read') continue
      read.mockResolvedValue({ ok: false, error })
      await selectImage(wrapper)
      expect(wrapper.get('.agent-editor__avatar-feedback').attributes('role')).toBe('alert')
      expect(wrapper.get('[data-testid="agent-avatar-button"] img').attributes('src')).toBe(AVATAR_URL)
      expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('clean')
      expect(document.activeElement).toBe(wrapper.get('[data-testid="agent-avatar-button"]').element)
    }
    wrapper.unmount()
  })

  it('读取期间禁用保存；关闭后丢弃未完成读取，不污染再次打开的表单', async () => {
    const pending: { resolve?: (value: Awaited<ReturnType<typeof avatarReader.readAccountAvatar>>) => void } = {}
    const promise = new Promise<Awaited<ReturnType<typeof avatarReader.readAccountAvatar>>>((resolve) => { pending.resolve = resolve })
    vi.spyOn(avatarReader, 'readAccountAvatar').mockReturnValue(promise)
    const wrapper = await editor()
    await selectImage(wrapper)
    expect(wrapper.get('[data-testid="agent-avatar-button"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.agent-editor__save-button').attributes('aria-disabled')).toBe('true')
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    pending.resolve?.({ ok: true, value: AVATAR_URL })
    await flushPromises()
    expect(wrapper.find('[data-testid="agent-avatar-button"] img').exists()).toBe(false)
    expect(wrapper.get('.agent-editor__save-state').attributes('data-state')).toBe('clean')
    wrapper.unmount()
  })

  it('重新配对保留已有头像，新配对默认无头像', () => {
    const existing = mockAgentSummaries().find((agent) => agent.id === 'research')
    if (existing === undefined) throw new Error('Missing research fixture')
    mockUpdateAgent(existing.id, { ...existing, avatarUrl: AVATAR_URL })
    mockUnlockIdentity()
    for (const mode of ['existing', 'new']) {
      if (mode !== 'existing' && mode !== 'new') continue
      const session = mockCreatePairing(mode)
      expect(mockConnectPairingLink(session.id, mockAgentPairingSecret(session.id)).ok).toBe(true)
      expect(mockRequestPairingApproval(session.id).ok).toBe(true)
      expect(mockAllowPairing(session.id, true).ok).toBe(true)
      const paired = mockConfirmPairing(session.id, 'Research', '')
      expect(paired.ok).toBe(true)
      if (paired.ok) {
        expect(paired.value.avatarUrl).toBe(mode === 'existing' ? AVATAR_URL : '')
        if (mode === 'new') mockDeleteAgent(paired.value.id)
      }
    }
    mockUpdateAgent(existing.id, existing)
    mockLockIdentity()
  })

  it('内置和自建 Agent 都能经 store 写入与清除头像', () => {
    const original = agentFixture()
    const config: AgentConfig = { name: original.name, note: original.note, model: original.model, avatarUrl: AVATAR_URL }
    const created = mockCreateAgent(config)
    expect(created.avatarUrl).toBe(AVATAR_URL)
    expect(created.builtIn).toBe(false)
    expect(mockUpdateAgent(created.id, { ...config, avatarUrl: '' })?.avatarUrl).toBe('')
    mockDeleteAgent(created.id)
    expect(mockUpdateAgent(original.id, config)?.avatarUrl).toBe(AVATAR_URL)
    expect(mockUpdateAgent(original.id, { ...config, avatarUrl: original.avatarUrl })?.avatarUrl).toBe(original.avatarUrl)
  })
})
