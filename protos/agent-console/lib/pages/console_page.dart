import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../data/console_controller.dart';
import '../theme/tokens.dart';
import '../widgets/agent_message_view.dart';
import '../widgets/chat_composer.dart';
import '../widgets/console_states.dart';
import '../widgets/empty_conversation.dart';
import '../widgets/user_bubble.dart';

/// 控制台页面:承载四态、对话流与输入区。
/// 页面本身不写业务规则,一切状态变化都通过 [ConsoleController] 完成。
class ConsolePage extends StatefulWidget {
  const ConsolePage({
    super.key,
    required this.themeMode,
    required this.onToggleTheme,
  });

  final ThemeMode themeMode;
  final VoidCallback onToggleTheme;

  @override
  State<ConsolePage> createState() => _ConsolePageState();
}

/// AppBar 溢出菜单的动作。
enum _MenuAction { reload, simulateFailure, clear }

class _ConsolePageState extends State<ConsolePage> {
  final ConsoleController _controller = ConsoleController();
  final TextEditingController _composer = TextEditingController();
  final FocusNode _composerFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _controller.load();
  }

  @override
  void dispose() {
    _controller.dispose();
    _composer.dispose();
    _composerFocus.dispose();
    super.dispose();
  }

  bool get _isDark => widget.themeMode == ThemeMode.dark;

  void _handleSend(String text) {
    _controller.send(text);
    _composer.clear();
  }

  void _handleMenu(_MenuAction action) {
    switch (action) {
      case _MenuAction.reload:
        _controller.load();
      case _MenuAction.simulateFailure:
        _controller.load(simulateFailure: true);
      case _MenuAction.clear:
        _controller.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Agent 控制台'),
        actions: <Widget>[
          IconButton(
            tooltip: _isDark ? '切换到浅色主题' : '切换到深色主题',
            onPressed: widget.onToggleTheme,
            icon: Icon(_isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
          ),
          PopupMenuButton<_MenuAction>(
            tooltip: '更多操作',
            onSelected: _handleMenu,
            itemBuilder: (BuildContext context) => const <PopupMenuEntry<_MenuAction>>[
              PopupMenuItem<_MenuAction>(
                value: _MenuAction.reload,
                child: Text('重新加载会话'),
              ),
              PopupMenuItem<_MenuAction>(
                value: _MenuAction.simulateFailure,
                child: Text('演示加载失败'),
              ),
              PopupMenuDivider(),
              PopupMenuItem<_MenuAction>(
                value: _MenuAction.clear,
                child: Text('清空会话'),
              ),
            ],
          ),
        ],
      ),
      // 安全区:内容避开刘海、圆角与 home indicator。
      body: SafeArea(
        child: ListenableBuilder(
          listenable: _controller,
          builder: (BuildContext context, _) {
            final bool showComposer = _controller.view == ConsoleView.empty ||
                _controller.view == ConsoleView.ready;
            return Column(
              children: <Widget>[
                Expanded(child: _buildBody()),
                if (showComposer)
                  ChatComposer(
                    controller: _composer,
                    focusNode: _composerFocus,
                    isGenerating: _controller.isGenerating,
                    onSend: _handleSend,
                    onStop: _controller.abort,
                  ),
              ],
            );
          },
        ),
      ),
      // 键盘弹起时压缩 body 而不是遮住输入框。
      resizeToAvoidBottomInset: true,
    );
  }

  Widget _buildBody() {
    return switch (_controller.view) {
      ConsoleView.loading => const ConsoleLoadingView(),
      ConsoleView.error => ConsoleErrorView(
          message: _controller.errorMessage,
          onRetry: () => _controller.load(),
        ),
      ConsoleView.empty => EmptyConversation(onPrompt: _controller.send),
      ConsoleView.ready => _buildMessageList(),
    };
  }

  /// 对话流用 reverse 列表:新消息始终贴着输入区出现,键盘弹起时也不会上跳。
  Widget _buildMessageList() {
    final List<contract.AgentMessage> messages = _controller.messages;
    return ListView.separated(
      reverse: true,
      padding: const EdgeInsets.all(Tokens.space4),
      itemCount: messages.length,
      separatorBuilder: (_, _) => const SizedBox(height: Tokens.space4),
      itemBuilder: (BuildContext context, int index) {
        final contract.AgentMessage message = messages[messages.length - 1 - index];
        if (message.role == contract.Role.USER) {
          return UserBubble(text: message.text);
        }
        return AgentMessageView(
          message: message,
          onRegenerate: () => _controller.regenerate(message.id),
          onApprovalDecision: (bool approved) =>
              _controller.resolveApproval(approved: approved),
        );
      },
    );
  }
}
