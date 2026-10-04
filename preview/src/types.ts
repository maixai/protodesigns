// registry 中单个原型的元信息,字段与 scripts/aggregate.mjs 产出的 JSON 一一对应。

// 原型覆盖的端。
export type ProtoTarget = 'web' | 'desktop' | 'mobile'

// 原型的数据形态。
export type ProtoData = 'remote-http' | 'local-first' | 'hybrid'

export interface ProtoMeta {
  name: string
  slug: string
  description: string
  owner: string
  owner_email: string
  // 同产品的多端原型共用一个 product 值;无关联时为 null。
  product: string | null
  targets: ProtoTarget[]
  data: ProtoData
  updated_at: string
  dir: string
}
