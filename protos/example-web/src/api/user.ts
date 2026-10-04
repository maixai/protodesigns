import { delay } from '../mocks/delay'
import { USERS } from '../mocks/user'
import type { User } from './user.types'

// 统一 API 返回结果(Result 模式):调用方在类型层面被迫处理失败分支。
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

// 获取全部用户列表,模拟网络延迟后返回 dummy 数据。
export async function fetchUsers(): Promise<Result<User[]>> {
  await delay()
  return { ok: true, value: USERS }
}

// 按 id 获取单个用户;不存在时返回失败分支。
export async function getUserById(id: string): Promise<Result<User>> {
  await delay()
  const user = USERS.find((item) => item.id === id)
  if (!user) {
    return { ok: false, error: new Error(`User ${id} not found`) }
  }
  return { ok: true, value: user }
}
