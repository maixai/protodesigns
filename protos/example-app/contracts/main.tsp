import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// 示例 App 原型的领域契约:与 protos/example-web/contracts/main.tsp 同属 product=example,
// 两端的实体与取值集合必须保持一致(见 .claude/rules/contracts.md 的跨端一致性规则)。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema。
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

// 接口契约示例:data 为 remote-http 的原型才需要。
@route("/users")
interface Users {
  @get list(): User[];
  @get read(@path id: string): User;
}
