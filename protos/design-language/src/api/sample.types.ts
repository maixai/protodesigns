// 契约生成物的转发出口:业务代码只从这里取类型,不直接深入 generated 目录。
// 生成物由 `make contracts` 产出,禁止手改,也禁止在别处重复定义同样的结构。
export type { SampleRecord, SampleStatus } from '../contracts/generated/sample-record'
