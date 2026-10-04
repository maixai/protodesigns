import 'package:flutter/material.dart';

import '../contracts/generated/user.dart';
import '../data/user_repository.dart';
import '../theme/tokens.dart';

/// 用户列表页:演示异步四态(有数据 / loading / empty / error)、
/// 安全区处理、底部导航与按压反馈。
class UserListPage extends StatefulWidget {
  const UserListPage({super.key});

  @override
  State<UserListPage> createState() => _UserListPageState();
}

/// 页面状态:判别联合式的三选一,避免多个可选字段拼出的隐式状态机。
sealed class _LoadState {
  const _LoadState();
}

class _Loading extends _LoadState {
  const _Loading();
}

class _Loaded extends _LoadState {
  const _Loaded(this.users);
  final List<User> users;
}

class _Failed extends _LoadState {
  const _Failed(this.message);
  final String message;
}

class _UserListPageState extends State<UserListPage> {
  static const UserRepository _repository = UserRepository();

  _LoadState _state = const _Loading();
  int _navIndex = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// 拉取数据并切换到对应状态;失败时进入 error 态而不是抛出。
  Future<void> _load() async {
    setState(() => _state = const _Loading());
    try {
      final List<User> users = await _repository.fetchAll();
      if (!mounted) return;
      setState(() => _state = _Loaded(users));
    } on Object catch (error) {
      if (!mounted) return;
      setState(() => _state = _Failed('加载用户失败:$error'));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('示例原型')),
      // 安全区:内容避开刘海、圆角与 home indicator。
      body: SafeArea(child: _buildBody()),
      // 底部导航:3 个 tab,自带安全区避让与按压反馈。
      bottomNavigationBar: NavigationBar(
        selectedIndex: _navIndex,
        onDestinationSelected: (int index) => setState(() => _navIndex = index),
        destinations: const <NavigationDestination>[
          NavigationDestination(icon: Icon(Icons.people_outline), label: '用户'),
          NavigationDestination(icon: Icon(Icons.inbox_outlined), label: '收件箱'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), label: '设置'),
        ],
      ),
    );
  }

  Widget _buildBody() {
    return switch (_state) {
      _Loading() => const _LoadingView(),
      _Failed(:final String message) => _ErrorView(message: message, onRetry: _load),
      _Loaded(:final List<User> users) =>
        users.isEmpty ? const _EmptyView() : _UserListView(users: users, onRefresh: _load),
    };
  }
}

/// loading 态:骨架式占位,不是白屏。
class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return const Center(child: CircularProgressIndicator());
  }
}

/// empty 态:文案 + 行动按钮。
class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('暂无用户', style: Theme.of(context).textTheme.bodyMedium),
    );
  }
}

/// error 态:错误提示 + 可重试动作。
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Tokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
            ),
            const SizedBox(height: Tokens.space4),
            FilledButton(onPressed: onRetry, child: const Text('重试')),
          ],
        ),
      ),
    );
  }
}

/// 有数据态:列表 + 下拉刷新。
class _UserListView extends StatelessWidget {
  const _UserListView({required this.users, required this.onRefresh});

  final List<User> users;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(Tokens.space4),
        itemCount: users.length,
        separatorBuilder: (_, _) => const SizedBox(height: Tokens.space3),
        itemBuilder: (BuildContext context, int index) {
          final User user = users[index];
          return Card(
            child: ListTile(
              title: Text(
                user.name,
                style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500),
              ),
              subtitle: Text(user.email),
              trailing: Text(
                user.active ? '启用' : '停用',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
