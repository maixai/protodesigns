// 中文 / CJK 名取姓名首字;拉丁名取前两个词的首字母大写;空串返回空串。
// 按 Unicode 码点拆分,避免把扩展汉字的代理对截断。
export function toInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed)) {
    return Array.from(trimmed)[0] ?? ''
  }
  return trimmed.split(/\s+/u).slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '').join('').toUpperCase()
}
