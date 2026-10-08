// 可预期的业务失败走 Result,调用方必须处理成功和失败分支。
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }
