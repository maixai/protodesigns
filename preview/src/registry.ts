// registry 数据访问:聚合产物是构建期静态数据,由 scripts/aggregate.mjs 生成。
// 运行时仍需校验其结构,防止字段缺失导致渲染异常;全程不使用 any。
import type { ProtoData, ProtoMeta, ProtoTarget } from './types'
import raw from './generated/protos-registry.json'
import rawBuildPlan from './generated/build-plan.json'

// 本次构建**确实产出过预览产物**的原型 slug。
//
// 为什么需要它:静态服务对未知路径会回退到预览站自己的 index.html,若给出来自未构建原型的
// 「在新标签打开」链接,打开的是预览站 SPA 本身,而它的路由里没有 /p/... → 一片空白,
// 看起来像坏掉了。因此必须提前知道哪些链接是活的。
const builtSlugs: ReadonlySet<string> = new Set(
  Array.isArray(rawBuildPlan.built)
    ? rawBuildPlan.built.filter((slug): slug is string => typeof slug === 'string')
    : [],
)

// 判断某原型本次是否构建出了预览产物;未构建时不应给出可打开的预览链接。
export function isBuilt(slug: string): boolean {
  return builtSlugs.has(slug)
}

// ProtoMeta 中值为字符串的字段清单,用于运行时结构校验。
const STRING_FIELDS: ReadonlyArray<keyof ProtoMeta> = [
  'name',
  'slug',
  'description',
  'owner',
  'owner_email',
  'data',
  'updated_at',
  'dir',
]

// 合法的端与数据形态取值,用于运行时收窄。
const TARGET_VALUES: readonly ProtoTarget[] = ['web', 'desktop', 'mobile']
const DATA_VALUES: readonly ProtoData[] = ['remote-http', 'local-first', 'hybrid']

// 判定未知值是否为合法的端取值。
function isProtoTarget(value: unknown): value is ProtoTarget {
  return typeof value === 'string' && (TARGET_VALUES as readonly string[]).includes(value)
}

// 判定未知值是否为合法的数据形态取值。
function isProtoData(value: unknown): value is ProtoData {
  return typeof value === 'string' && (DATA_VALUES as readonly string[]).includes(value)
}

// 判定未知值是否为合法的 ProtoMeta:字符串字段齐备、targets 为非空合法数组、product 为字符串或 null。
function isProtoMeta(value: unknown): value is ProtoMeta {
  if (typeof value !== 'object' || value === null) return false
  // 聚合产物来自外部脚本,JSON 推断类型不保证运行时结构,收窄为可索引对象逐字段校验。
  const record = value as Record<string, unknown>
  if (!STRING_FIELDS.every((field) => typeof record[field] === 'string')) return false
  if (!isProtoData(record['data'])) return false
  const targets = record['targets']
  if (!Array.isArray(targets) || targets.length === 0) return false
  if (!targets.every((item) => isProtoTarget(item))) return false
  const product = record['product']
  return product === null || typeof product === 'string'
}

// 判定未知值是否为 ProtoMeta 数组。
function isProtoMetaArray(value: unknown): value is ProtoMeta[] {
  return Array.isArray(value) && value.every((item) => isProtoMeta(item))
}

// git %ci 时间格式:"YYYY-MM-DD HH:MM:SS ±HHMM"(聚合脚本产出的主要格式)。
const GIT_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/

// 解析 git %ci 格式的时间,返回自 epoch 起的毫秒数;格式不符时返回 null。
function parseGitCiTime(value: string): number | null {
  const match = GIT_TIME_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second, sign, offsetHour, offsetMinute] = match
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    sign === undefined ||
    offsetHour === undefined ||
    offsetMinute === undefined
  ) {
    return null
  }
  const offsetSign = sign === '-' ? -1 : 1
  const offsetMs = offsetSign * (Number(offsetHour) * 60 + Number(offsetMinute)) * 60_000
  const utcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  return utcMs - offsetMs
}

// 把 updated_at 字符串解析为可比较的时间戳(毫秒)。
// 兼容聚合脚本产出的两种格式:git %ci 与 ISO 8601。
export function parseUpdatedAt(updatedAt: string): number {
  const gitTime = parseGitCiTime(updatedAt)
  if (gitTime !== null) return gitTime
  return new Date(updatedAt).getTime()
}

// 判断某个 updated_at 是否落在"今日"(浏览器本地时区);解析失败时返回 false。
export function isUpdatedToday(updatedAt: string): boolean {
  const ms = parseUpdatedAt(updatedAt)
  if (Number.isNaN(ms)) return false
  const updated = new Date(ms)
  const now = new Date()
  return (
    updated.getFullYear() === now.getFullYear() &&
    updated.getMonth() === now.getMonth() &&
    updated.getDate() === now.getDate()
  )
}

// 校验通过后的 proto 列表,按更新时间倒序排列(新到旧)。
const protos: ProtoMeta[] = isProtoMetaArray(raw.protos)
  ? [...raw.protos].sort((a, b) => parseUpdatedAt(b.updated_at) - parseUpdatedAt(a.updated_at))
  : []

// 返回全部原型,按更新时间倒序。
export function getProtos(): ProtoMeta[] {
  return protos
}

// 按 slug 查找单个原型,不存在时返回 undefined。
export function getProto(slug: string): ProtoMeta | undefined {
  return protos.find((proto) => proto.slug === slug)
}
