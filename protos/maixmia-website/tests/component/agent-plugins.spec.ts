import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentPlugins from '../../src/components/agent-plugins.vue'
import * as api from '../../src/api/workspace'
import type { MarketplaceBinding } from '../../src/contracts/generated/marketplace-binding'
import type { Plugin, PluginConfigSchema } from '../../src/contracts/generated/plugin'
import type { PluginConfigValue } from '../../src/contracts/generated/plugin-config-value'
import { validatePluginConfig } from '../../src/components/agent-plugin-config'
import type { InstalledPlugin } from '../../src/contracts/generated/installed-plugin'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/workspace', () => ({
  addMarketplace: vi.fn(), installPlugin: vi.fn(), listInstalledPlugins: vi.fn(), listMarketplaceBindings: vi.fn(),
  removeMarketplace: vi.fn(), savePluginConfig: vi.fn(), setMarketplaceAutoUpdate: vi.fn(), setPluginEnabled: vi.fn(),
  uninstallPlugin: vi.fn(), updateInstalledPlugin: vi.fn(), updateMarketplace: vi.fn(),
}))

const addedBinding: MarketplaceBinding = {
  marketplace: {
    id: 'mia-labs', name: 'Mia Labs', source: 'github.com/maixai/agent-plugins', trust: 'community', plugins: [],
  },
  autoUpdate: false,
  lastUpdated: '2026-11-04T00:00:00Z',
  installedCount: 0,
}

class ResizeObserverMock implements ResizeObserver {
  static instances: ResizeObserverMock[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  trigger(): void {
    this.callback([], this)
  }
}

function plugin(id: string, marketplaceId: string, config: PluginConfigSchema[] = []): Plugin {
  return {
    id, marketplaceId, name: `${marketplaceId} ${id}`, description: `Tools for ${id} workflows.`,
    publisher: 'Demo Publisher', version: '1.0.0', icon: 'code', components: [{ id: 'command', count: 1 }], config, mcpServers: [],
  }
}

function marketplace(id: string, count: number): MarketplaceBinding {
  return {
    marketplace: {
      id, name: id === 'anthropic' ? 'Anthropic Plugins' : 'Community Registry',
      source: `github.com/example/${id}`, trust: 'community',
      plugins: Array.from({ length: count }, (_, index) => plugin(`plugin-${index + 1}`, id)),
    },
    autoUpdate: false, lastUpdated: '2026-11-04T00:00:00Z', installedCount: 0,
  }
}

function installedPlugin(item: Plugin, values: readonly PluginConfigValue[] = []): InstalledPlugin {
  const provided = new Map(values.map((value) => [value.key, value.value]))
  return {
    plugin: item, enabled: true, scope: 'agent', marketplaceName: item.marketplaceId,
    installedVersion: item.version,
    config: item.config.map((field) => {
      const value = provided.get(field.key)
      return {
        ...field,
        value: value ?? (field.type === 'secret' ? '' : field.default),
        isSet: value !== undefined ? value !== '' : field.type === 'boolean' ? true : field.default !== '',
      }
    }),
  }
}

async function mountInstallPanel(): Promise<VueWrapper> {
  vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [marketplace('anthropic', 6), marketplace('community', 6)] })
  const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
  await flushPromises()
  await wrapper.get('.plugin-add').trigger('click')
  await flushPromises()
  return wrapper
}

async function measureRows(wrapper: VueWrapper, availableHeight: number, rowHeight = 80): Promise<void> {
  const list = wrapper.get('.install-list')
  Object.defineProperty(list.element, 'clientHeight', { configurable: true, value: availableHeight })
  const firstRow = wrapper.get('.install-row')
  vi.spyOn(firstRow.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, rowHeight))
  ResizeObserverMock.instances.at(-1)?.trigger()
  await flushPromises()
}

describe('agent-plugins', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    ResizeObserverMock.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.mocked(api.listInstalledPlugins).mockResolvedValue({ ok: true, value: [] })
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [] })
    vi.mocked(api.addMarketplace).mockResolvedValue({ ok: true, value: addedBinding })
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('opens marketplace creation as a subpage, restores focus on back and returns after submit', async () => {
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    const addButton = wrapper.get('.market-add')
    await addButton.trigger('click')
    await flushPromises()

    expect(wrapper.attributes('data-view')).toBe('addMarketplace')
    expect(wrapper.get('.plugin-groups').isVisible()).toBe(false)
    const name = wrapper.get('#agent-plugins-planning-market-name')
    expect(document.activeElement).toBe(name.element)
    await name.setValue('Draft market')
    await wrapper.get('.plugin-add-market .plugin-back').trigger('click')
    await flushPromises()
    expect(wrapper.attributes('data-view')).toBe('list')
    expect(document.activeElement).toBe(addButton.element)

    await addButton.trigger('click')
    await flushPromises()
    const reopenedName = wrapper.get('#agent-plugins-planning-market-name')
    expect(reopenedName.element).toHaveProperty('value', '')
    await reopenedName.setValue('Mia Labs')
    await wrapper.get('#agent-plugins-planning-market-source').setValue('github.com/maixai/agent-plugins')
    await wrapper.get('.add-market button[type="submit"]').trigger('click')
    await flushPromises()

    expect(api.addMarketplace).toHaveBeenCalledWith('agent', 'planning', {
      name: 'Mia Labs', source: 'github.com/maixai/agent-plugins', autoUpdate: false,
    })
    expect(wrapper.attributes('data-view')).toBe('list')
    expect(wrapper.get('.market-row').text()).toContain('Mia Labs')
    expect(wrapper.emitted('announce')?.at(-1)).toEqual(['已添加市场「Mia Labs」'])
    expect(document.activeElement).toBe(addButton.element)
    wrapper.unmount()
  })

  it('filters install candidates by marketplace and query and resets to the first page', async () => {
    const wrapper = await mountInstallPanel()
    await measureRows(wrapper, 160)
    expect(wrapper.findAll('.install-row')).toHaveLength(2)
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 6 页')

    const market = wrapper.get('.install-market')
    expect(market.attributes('aria-label')).toBe('筛选插件市场')
    await market.setValue('community')
    expect(wrapper.findAll('.install-row').every((row) => row.attributes('data-marketplace') === 'community')).toBe(true)
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 3 页')
    await wrapper.get('.install-pagination .plugin-action:last-child').trigger('click')
    expect(wrapper.get('.install-page-status').text()).toBe('第 2 / 3 页')
    wrapper.get('.install-list').element.scrollTop = 48
    await market.setValue('anthropic')
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 3 页')
    expect(wrapper.get('.install-list').element.scrollTop).toBe(0)
    await market.setValue('community')
    await wrapper.get('.install-pagination .plugin-action:last-child').trigger('click')
    expect(wrapper.get('.install-page-status').text()).toBe('第 2 / 3 页')

    await wrapper.get('.install-toolbar input[type="search"]').setValue('community plugin-6')
    expect(wrapper.findAll('.install-row')).toHaveLength(1)
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 1 页')
    expect(wrapper.get('.install-pagination .plugin-action:last-child').attributes('disabled')).toBeDefined()
    await wrapper.get('.install-toolbar input[type="search"]').setValue('missing-plugin')
    expect(wrapper.find('.install-list').exists()).toBe(false)
    expect(wrapper.find('.install-pagination').exists()).toBe(false)
    expect(wrapper.text()).toContain('没有匹配的插件')
    wrapper.unmount()
  })

  it('recomputes page size from list measurements and clamps the current page', async () => {
    const wrapper = await mountInstallPanel()
    await measureRows(wrapper, 240)
    expect(wrapper.findAll('.install-row')).toHaveLength(3)
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 4 页')
    await measureRows(wrapper, 160)
    expect(wrapper.findAll('.install-row')).toHaveLength(2)
    expect(wrapper.get('.install-page-status').text()).toBe('第 1 / 6 页')

    for (let page = 1; page < 6; page += 1) await wrapper.get('.install-pagination .plugin-action:last-child').trigger('click')
    expect(wrapper.get('.install-page-status').text()).toBe('第 6 / 6 页')
    expect(wrapper.findAll('.install-row')).toHaveLength(2)
    await measureRows(wrapper, 240)
    expect(wrapper.get('.install-page-status').text()).toBe('第 4 / 4 页')
    expect(wrapper.get('.install-list').attributes('tabindex')).toBe('0')
    wrapper.unmount()
  })

  it('opens the unified install dialog with editable required defaults, submits all five field kinds and focuses the new row', async () => {
    const fields: PluginConfigSchema[] = [
      { key: 'command', label: 'Test command', description: 'Command to run.', type: 'text', required: true, default: 'pnpm test', options: [] },
      { key: 'timeout', label: 'Timeout', description: 'Seconds before stopping.', type: 'number', required: true, default: '120', options: [] },
      { key: 'scope', label: 'Test scope', description: 'Tests to run.', type: 'choice', required: true, default: 'changed', options: ['changed', 'all', 'related'] },
      { key: 'failFast', label: 'Fail fast', description: 'Stop on first failure.', type: 'boolean', required: false, default: 'false', options: [] },
      { key: 'token', label: 'Token', description: 'Optional upload token.', type: 'secret', required: false, default: '', options: [] },
    ]
    const candidate = plugin('test-runner', 'anthropic', fields)
    const binding = marketplace('anthropic', 0)
    binding.marketplace.plugins = [candidate]
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [binding] })
    vi.mocked(api.installPlugin).mockResolvedValue({ ok: true, value: installedPlugin(candidate) })
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-add').trigger('click')
    await flushPromises()

    expect(wrapper.get('.install-row').text()).toContain('需配置')
    await wrapper.get('.install-row__action').trigger('click')
    await flushPromises()
    expect(wrapper.attributes('data-view')).toBe('install')
    const configDialog = wrapper.get('.plugin-config-dialog')
    expect(configDialog.attributes('aria-modal')).toBe('true')
    expect(configDialog.findAll('.plugin-config-dialog__section-title').map((element) => element.text())).toEqual(['配置项'])
    expect(wrapper.get('[data-config-key="command"]').element).toHaveProperty('value', 'pnpm test')
    expect(wrapper.get('[data-config-key="timeout"]').element).toHaveProperty('value', '120')
    expect(wrapper.get('[data-config-key="scope"]').element).toHaveProperty('value', 'changed')
    expect(wrapper.get('[data-config-key="failFast"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.get('[data-config-key="token"]').attributes('type')).toBe('password')
    expect(wrapper.get('[data-config-key="token"]').element).toHaveProperty('value', '')
    expect(api.installPlugin).not.toHaveBeenCalled()

    await wrapper.get('.plugin-config-dialog button[type="submit"]').trigger('click')
    await flushPromises()
    expect(api.installPlugin).toHaveBeenCalledWith('agent', 'planning', 'anthropic', 'test-runner', [
      { key: 'command', value: 'pnpm test' },
      { key: 'timeout', value: '120' },
      { key: 'scope', value: 'changed' },
      { key: 'failFast', value: 'false' },
      { key: 'token', value: '' },
    ])
    expect(wrapper.attributes('data-view')).toBe('list')
    const newRow = wrapper.get('.plugin-main[data-plugin-key="test-runner@anthropic"]')
    expect(newRow.text()).toContain('anthropic test-runner')
    expect(document.activeElement).toBe(newRow.element)
    wrapper.unmount()
  })

  it('shows optional settings in the install dialog and keeps the secondary configuration entry', async () => {
    const candidate = plugin('docs-writer', 'anthropic', [
      { key: 'styleGuide', label: 'Style guide', description: 'Optional style guide path.', type: 'text', required: false, default: '', options: [] },
    ])
    const binding = marketplace('anthropic', 0)
    binding.marketplace.plugins = [candidate]
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [binding] })
    vi.mocked(api.installPlugin).mockImplementation(async (_scope, _ownerId, _marketplaceId, _pluginId, values) => ({
      ok: true, value: installedPlugin(candidate, values),
    }))
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-add').trigger('click')
    await flushPromises()

    expect(wrapper.get('.install-row').text()).not.toContain('需配置')
    await wrapper.get('.install-row__action').trigger('click')
    await flushPromises()
    expect(api.installPlugin).not.toHaveBeenCalled()
    const review = wrapper.get('.plugin-config-dialog')
    expect(review.text()).toContain('Anthropic Plugins')
    expect(review.text()).toContain('Demo Publisher')
    expect(review.text()).toContain('安装到「规划助手」')
    expect(review.text()).not.toContain('配置项均为可选')
    expect(review.findAll('.plugin-config-dialog__section-title').map((element) => element.text())).toEqual(['配置项'])
    expect(review.find('[data-config-control]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[data-config-key="styleGuide"]').element)

    await wrapper.get('[data-config-key="styleGuide"]').setValue('docs/style-guide.md')
    await review.get('.plugin-config-dialog__action--primary').trigger('click')
    await flushPromises()
    expect(api.installPlugin).toHaveBeenCalledWith('agent', 'planning', 'anthropic', 'docs-writer', [
      { key: 'styleGuide', value: 'docs/style-guide.md' },
    ])
    expect(wrapper.attributes('data-view')).toBe('list')
    expect(wrapper.get('.plugin-install-feedback').text()).toContain('可随时补充可选配置')
    await wrapper.get('.plugin-install-feedback .plugin-action').trigger('click')
    await flushPromises()
    expect(wrapper.attributes('data-view')).toBe('detail')
    expect(wrapper.get('[data-config-key="styleGuide"]').element).toHaveProperty('value', 'docs/style-guide.md')
    wrapper.unmount()
  })

  it('reviews a no-config plugin without installing on cancel, then installs and focuses the new row', async () => {
    const candidate = plugin('dependency-graph', 'anthropic')
    const binding = marketplace('anthropic', 0)
    binding.marketplace.plugins = [candidate]
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [binding] })
    vi.mocked(api.installPlugin).mockResolvedValue({ ok: true, value: installedPlugin(candidate) })
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-add').trigger('click')
    await flushPromises()
    const trigger = wrapper.get('.install-row__action')

    await trigger.trigger('click')
    await flushPromises()
    const review = wrapper.get('.plugin-config-dialog')
    expect(review.attributes('aria-modal')).toBe('true')
    expect(review.text()).toContain('确认安装')
    expect(review.text()).toContain('dependency-graph')
    expect(review.text()).not.toContain('配置项均为可选')
    expect(review.findAll('.plugin-config-dialog__section-title')).toHaveLength(0)
    expect(review.find('[data-config-control]').exists()).toBe(false)
    expect(api.installPlugin).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(wrapper.get('.plugin-config-dialog__action').element)

    await wrapper.get('.plugin-config-dialog__action').trigger('click')
    await flushPromises()
    expect(wrapper.find('.plugin-config-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(api.installPlugin).not.toHaveBeenCalled()

    await trigger.trigger('click')
    await flushPromises()
    await wrapper.get('.plugin-config-dialog__action--primary').trigger('click')
    await flushPromises()
    expect(api.installPlugin).toHaveBeenCalledWith('agent', 'planning', 'anthropic', 'dependency-graph', [])
    expect(wrapper.attributes('data-view')).toBe('list')
    expect(wrapper.find('.plugin-install-feedback').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.plugin-main[data-plugin-key="dependency-graph@anthropic"]').element)
    wrapper.unmount()
  })

  it('keeps install failures inside the active dialog and clears them on reopen', async () => {
    const required = plugin('test-runner', 'anthropic', [
      { key: 'command', label: 'Command', description: '', type: 'text', required: true, default: 'pnpm test', options: [] },
    ])
    const noConfig = plugin('dependency-graph', 'anthropic')
    const binding = marketplace('anthropic', 0)
    binding.marketplace.plugins = [required, noConfig]
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [binding] })
    vi.mocked(api.installPlugin).mockResolvedValue({ ok: false, error: new Error('Install failed') })
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-add').trigger('click')
    await flushPromises()
    await measureRows(wrapper, 240)

    const triggers = wrapper.findAll('.install-row__action')
    await triggers[0]?.trigger('click')
    await flushPromises()
    await wrapper.get('.plugin-config-dialog__action--primary').trigger('click')
    await flushPromises()
    expect(wrapper.get('.plugin-config-dialog__error').text()).toBe('Install failed')
    expect(wrapper.find('.plugin-config-dialog').exists()).toBe(true)
    await wrapper.get('.plugin-config-dialog__action').trigger('click')
    await flushPromises()
    await triggers[0]?.trigger('click')
    await flushPromises()
    expect(wrapper.find('.plugin-config-dialog__error').exists()).toBe(false)
    await wrapper.get('.plugin-config-dialog__action').trigger('click')
    await flushPromises()

    await triggers[1]?.trigger('click')
    await flushPromises()
    await wrapper.get('.plugin-config-dialog__action--primary').trigger('click')
    await flushPromises()
    expect(wrapper.get('.plugin-config-dialog__error').text()).toBe('Install failed')
    expect(wrapper.find('.plugin-config-dialog').exists()).toBe(true)
    await wrapper.get('.plugin-config-dialog__action').trigger('click')
    await flushPromises()
    await triggers[1]?.trigger('click')
    await flushPromises()
    expect(wrapper.find('.plugin-config-dialog__error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps install validation inline, focuses the first invalid field and never echoes a required secret', async () => {
    const candidate = plugin('notion-sync', 'community', [
      { key: 'token', label: 'Integration token', description: 'Notion token.', type: 'secret', required: true, default: '', options: [] },
      { key: 'databaseId', label: 'Database ID', description: 'Target database.', type: 'text', required: true, default: '', options: [] },
      { key: 'timeout', label: 'Timeout', description: 'Request timeout.', type: 'number', required: true, default: '120', options: [] },
    ])
    const binding = marketplace('community', 0)
    binding.marketplace.plugins = [candidate]
    vi.mocked(api.listMarketplaceBindings).mockResolvedValue({ ok: true, value: [binding] })
    const installed = installedPlugin(candidate)
    installed.config = installed.config.map((field) => {
      if (field.type === 'secret') return { ...field, value: '••••••••', isSet: true }
      if (field.key === 'databaseId') return { ...field, value: 'database-1', isSet: true }
      return field
    })
    vi.mocked(api.installPlugin).mockResolvedValue({ ok: true, value: installed })
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-add').trigger('click')
    await flushPromises()
    await wrapper.get('.install-row__action').trigger('click')
    await flushPromises()

    const secret = wrapper.get('[data-config-key="token"]')
    expect(secret.attributes('type')).toBe('password')
    expect(secret.element).toHaveProperty('value', '')
    await wrapper.get('.plugin-config-dialog button[type="submit"]').trigger('click')
    await flushPromises()
    expect(api.installPlugin).not.toHaveBeenCalled()
    expect(wrapper.get('.plugin-field-error').text()).toBe('请填写必填配置项')
    expect(document.activeElement).toBe(secret.element)

    await secret.setValue('secret_demo_token')
    await wrapper.get('[data-config-key="databaseId"]').setValue('database-1')
    await wrapper.get('[data-config-key="timeout"]').setValue('Infinity')
    await wrapper.get('.plugin-config-dialog button[type="submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.plugin-field-error').text()).toBe('请输入有效数值')
    expect(document.activeElement).toBe(wrapper.get('[data-config-key="timeout"]').element)
    await wrapper.get('[data-config-key="timeout"]').setValue('90')
    await wrapper.get('.plugin-config-dialog button[type="submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.attributes('data-view')).toBe('list')
    expect(wrapper.get('.plugin-main[data-plugin-key="notion-sync@community"]').text()).not.toContain('需配置')
    wrapper.unmount()
  })

  it('uses number and choice in details and keeps a saved secret when left blank', async () => {
    const item = installedPlugin(plugin('test-runner', 'anthropic', [
      { key: 'timeout', label: 'Timeout', description: 'Request timeout.', type: 'number', required: true, default: '120', options: [] },
      { key: 'scope', label: 'Test scope', description: 'Tests to run.', type: 'choice', required: true, default: 'changed', options: ['changed', 'all', 'related'] },
      { key: 'token', label: 'Token', description: 'Upload token.', type: 'secret', required: true, default: '', options: [] },
    ]))
    item.config = item.config.map((field) => field.type === 'secret' ? { ...field, value: '••••••••', isSet: true } : field)
    vi.mocked(api.listInstalledPlugins).mockResolvedValue({ ok: true, value: [item] })
    vi.mocked(api.savePluginConfig).mockResolvedValue({ ok: true, value: item })
    const wrapper = mount(AgentPlugins, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('.plugin-main').trigger('click')
    await flushPromises()

    await wrapper.get('[data-config-key="timeout"]').setValue('180')
    await wrapper.get('[data-config-key="scope"]').setValue('all')
    const secret = wrapper.get('[data-config-key="token"]')
    expect(secret.element).toHaveProperty('value', '')
    expect(secret.attributes('placeholder')).toBe('已保存，留空则保持不变')
    await wrapper.get('.plugin-detail button[type="submit"]').trigger('click')
    await flushPromises()
    expect(api.savePluginConfig).toHaveBeenCalledWith('agent', 'planning', 'anthropic', 'test-runner', [
      { key: 'timeout', value: '180' },
      { key: 'scope', value: 'all' },
    ])
    wrapper.unmount()
  })

  it('shares finite-number and options-membership validation between install and detail modes', () => {
    const fields: PluginConfigSchema[] = [
      { key: 'timeout', label: 'Timeout', description: '', type: 'number', required: true, default: '120', options: [] },
      { key: 'scope', label: 'Scope', description: '', type: 'choice', required: true, default: 'changed', options: ['changed', 'all'] },
      { key: 'token', label: 'Token', description: '', type: 'secret', required: true, default: '', options: [] },
    ]
    expect(validatePluginConfig(fields, { timeout: 'NaN', scope: 'unexpected', token: '' }, 'install', () => false)).toEqual([
      { key: 'timeout', kind: 'number' },
      { key: 'scope', kind: 'choice' },
      { key: 'token', kind: 'required' },
    ])
    expect(validatePluginConfig(fields, { timeout: '120', scope: 'all', token: '' }, 'detail', () => true)).toEqual([])
  })
})
