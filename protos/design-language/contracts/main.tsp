import "@typespec/json-schema";

using TypeSpec.JsonSchema;

// 设计语言展示页的领域契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/)由 `make contracts` 从此处生成,不手写。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//      @summary 决定生成的类型名(json-schema emitter 把它映射为 JSON Schema 的 title,
//      生成器优先用 title 命名,否则会退化成带文件名后缀的名字)。
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema,
//      因此每个生成的 schema 文件都是自包含的,不会产生跨文件重复导出。
namespace DesignLanguage;

// 样例记录的状态:取值集合即契约的一部分;被 SampleRecord 引用,故自动内联,不单独产出文件。
enum SampleStatus {
  active,
  paused,
  archived,
}

// 组件样例记录:供展示页的异步四态(有数据 / loading / empty / error)演示使用。
@summary("SampleRecord")
@jsonSchema
model SampleRecord {
  id: string;
  title: string;
  owner: string;
  status: SampleStatus;
  updatedAt: string;
}
