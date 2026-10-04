import '../contracts/generated/user.dart';

/// 模拟一次网络往返:与 web 侧 src/mocks/delay.ts 一致,150-300ms 随机延迟。
Future<void> _delay() {
  final int span = DateTime.now().microsecondsSinceEpoch % 151;
  return Future<void>.delayed(Duration(milliseconds: 150 + span));
}

/// 用户数据访问层:原型期返回内存中的 dummy 数据,不接真实后端、不做持久化。
/// 类型来自契约生成物(lib/contracts/generated),不在此重复定义结构。
class UserRepository {
  const UserRepository();

  /// 获取全部用户。
  /// 用 fromJson 构造,保证字段取值集合与契约一致(枚举传字符串原名)。
  static final List<User> _users = <User>[
    User.fromJson(<String, dynamic>{
      'id': 'u-001',
      'name': '林晚晴',
      'email': 'lin.wanqing@example.com',
      'role': 'admin',
      'active': true,
    }),
    User.fromJson(<String, dynamic>{
      'id': 'u-002',
      'name': '陈墨',
      'email': 'chen.mo@example.com',
      'role': 'member',
      'active': true,
    }),
    User.fromJson(<String, dynamic>{
      'id': 'u-003',
      'name': '周子衿',
      'email': 'zhou.zijin@example.com',
      'role': 'viewer',
      'active': false,
    }),
  ];

  Future<List<User>> fetchAll() async {
    await _delay();
    return _users;
  }
}
