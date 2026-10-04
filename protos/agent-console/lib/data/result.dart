/// 统一返回结果:把**可预期的业务失败**编码进类型,调用方被迫处理失败分支。
/// 不可恢复的程序错误仍然用 throw。对应共享基线的 Result 模式。
sealed class Result<T> {
  const Result();
}

/// 成功分支。
final class Ok<T> extends Result<T> {
  const Ok(this.value);

  final T value;
}

/// 失败分支;原型期携带直接可展示的中文提示。
final class Err<T> extends Result<T> {
  const Err(this.message);

  final String message;
}
