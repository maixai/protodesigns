// registry 中单个原型的元信息,字段与 scripts/aggregate.mjs 产出的 JSON 一一对应。
export interface ProtoMeta {
  name: string
  slug: string
  description: string
  owner: string
  owner_email: string
  updated_at: string
  dir: string
}
