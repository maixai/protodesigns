// 统一 API 返回结果:调用方在类型层面被迫处理失败分支,而不是靠约定。
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }
