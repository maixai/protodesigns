// Agent 沿用侧栏的首字与大小写，不使用账户头像的双字母缩写。
// 按码点取字，避免截断扩展汉字或表情的 UTF-16 代理对。
export function agentInitial(name: string): string {
  return name[Symbol.iterator]().next().value ?? ''
}
