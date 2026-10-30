import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { fetchUsers } from '../../src/api/user'

// 组件测试只验证 UI 与数据层的契约:不启动浏览器,不依赖 150-300ms 的真实延迟。
vi.mock('../../src/api/user', () => ({
  fetchUsers: vi.fn(async () => ({
    ok: true,
    value: [{ id: 'u1', name: '张三', role: '管理员', email: 'zhangsan@example.com', active: true }],
  })),
}))

vi.mock('../../src/shell', () => ({
  shell: {
    menu: { groups: () => [], onCommand: () => () => {} },
    theme: { current: () => 'light', setOverride: () => {}, onChange: () => () => {} },
    window: { size: () => ({ width: 1280, height: 800 }), onResize: () => () => {} },
  },
}))

import App from '../../src/App.vue'

describe('App', () => {
  it('加载 dummy 用户后渲染姓名与角色', async () => {
    const wrapper = mount(App)
    await flushPromises()
    expect(fetchUsers).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('示例原型')
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('管理员')
    wrapper.unmount()
  })
})
