import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// 示例原型的领域契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//      @summary 决定生成的类型名(json-schema emitter 把它映射为 JSON Schema 的 title,
//      生成器优先用 title 命名,否则会退化成 UserYaml 这种带文件名后缀的名字)。
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema,
//      因此每个生成的 schema 文件都是自包含的,不会产生跨文件重复导出。
namespace Example;

// 用户角色:取值集合即契约的一部分;被 User 引用,故自动内联,不单独产出文件。
enum UserRole {
  admin,
  member,
  viewer,
}

// 用户实体。
@summary("User")
@jsonSchema
model User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

// 接口契约示例:data 为 remote-http 的原型才需要;纯 dummy 数据的原型可删除。
@route("/users")
interface Users {
  @get list(): User[];
  @get read(@path id: string): User;
}
