// registry 数据访问:聚合产物是构建期静态数据,由 scripts/aggregate.mjs 生成。
// 运行时仍需校验其结构,防止字段缺失导致渲染异常;全程不使用 any。
import type { ProtoMeta } from './types'
import raw from './generated/protos-registry.json'

// ProtoMeta 的字段清单,用于运行时结构校验。
const PROTO_FIELDS: ReadonlyArray<keyof ProtoMeta> = [
  'name',
  'slug',
  'description',
  'owner',
  'owner_email',
  'updated_at',
  'dir',
]

// 判定未知值是否为合法的 ProtoMeta:非空对象且全部字段均为字符串。
function isProtoMeta(value: unknown): value is ProtoMeta {
  if (typeof value !== 'object' || value === null) return false
  // 聚合产物来自外部脚本,JSON 推断类型不保证运行时结构,收窄为可索引对象逐字段校验。
  const record = value as Record<string, unknown>
  return PROTO_FIELDS.every((field) => typeof record[field] === 'string')
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
