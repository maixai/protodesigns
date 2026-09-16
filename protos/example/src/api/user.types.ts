// 用户领域共用类型:作为 API 契约的一部分,供 api 层、mock 数据与页面组件共同引用。
export type UserRole = 'admin' | 'member' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}
