// 安装期与详情页共用的配置草稿与校验规则;字段语义只来自契约生成的 schema。
import type { PluginConfigSchema } from '../contracts/generated/plugin'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'

export type PluginConfigMode = 'install' | 'detail'
export type PluginConfigIssueKind = 'required' | 'number' | 'choice'

export interface PluginConfigIssue {
  key: string
  kind: PluginConfigIssueKind
}

// 安装期把 default 作为可编辑值预填;secret 永不带回显或默认值。
export function installConfigDraft(fields: readonly PluginConfigSchema[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [
    field.key,
    field.type === 'secret' ? '' : field.type === 'boolean' ? String(field.default === 'true') : field.default,
  ]))
}

// 返回按 schema 顺序排列的问题,调用方据此聚焦第一个无效字段。
export function validatePluginConfig(
  fields: readonly PluginConfigSchema[],
  values: Record<string, string>,
  mode: PluginConfigMode,
  isSecretSet: (key: string) => boolean,
): PluginConfigIssue[] {
  const issues: PluginConfigIssue[] = []
  for (const field of fields) {
    if (field.type === 'boolean') continue
    const value = (values[field.key] ?? '').trim()
    const keepsSavedSecret = mode === 'detail' && field.type === 'secret' && value === '' && isSecretSet(field.key)
    if (field.required && value === '' && !keepsSavedSecret) {
      issues.push({ key: field.key, kind: 'required' })
      continue
    }
    if (value === '') continue
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      issues.push({ key: field.key, kind: 'number' })
      continue
    }
    if (field.type === 'choice' && !field.options.includes(value)) issues.push({ key: field.key, kind: 'choice' })
  }
  return issues
}

// 生成 API 载荷。详情页空 secret 不下发,由数据层保持原值;安装期空值就是未设置。
export function pluginConfigValues(
  fields: readonly PluginConfigSchema[],
  values: Record<string, string>,
  mode: PluginConfigMode,
): PluginConfigValue[] {
  const result: PluginConfigValue[] = []
  for (const field of fields) {
    const value = values[field.key] ?? ''
    if (mode === 'detail' && field.type === 'secret' && value === '') continue
    result.push({
      key: field.key,
      value: field.type === 'boolean' ? String(value === 'true') : field.type === 'number' ? value.trim() : value,
    })
  }
  return result
}
