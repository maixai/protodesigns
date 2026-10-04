import type { User } from '../api/user.types'

// 内置 dummy 用户数据,仅用于原型交互验证;刷新即重置,不接真实后端。
export const USERS: User[] = [
  {
    id: 'u-001',
    name: '林晚晴',
    email: 'lin.wanqing@example.com',
    role: 'admin',
    active: true,
  },
  {
    id: 'u-002',
    name: '陈墨',
    email: 'chen.mo@example.com',
    role: 'member',
    active: true,
  },
  {
    id: 'u-003',
    name: '周子衿',
    email: 'zhou.zijin@example.com',
    role: 'viewer',
    active: false,
  },
]
