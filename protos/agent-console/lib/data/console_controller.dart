import 'dart:async';

import 'package:flutter/foundation.dart';

import '../contracts/generated/conversation.dart' as contract;
import 'agent_repository.dart';
import 'message_ops.dart';
import 'result.dart';

/// 会话视图的四态。
enum ConsoleView { loading, empty, error, ready }

/// 控制台状态机:持有消息列表与视图状态,把仓库的事件流落到界面模型上。
/// 用 [ChangeNotifier] 是因为它只依赖 Flutter 框架本身,不需要额外的状态管理库。
class ConsoleController extends ChangeNotifier {
  ConsoleController({AgentRepository repository = const AgentRepository()})
      : _repository = repository;

  final AgentRepository _repository;

  ConsoleView _view = ConsoleView.loading;
  List<contract.AgentMessage> _messages = const <contract.AgentMessage>[];
  String _errorMessage = '';
  bool _isGenerating = false;
  int _sequence = 0;

  AgentTurn? _turn;
  StreamSubscription<AgentEvent>? _subscription;
  bool _disposed = false;

  ConsoleView get view => _view;

  List<contract.AgentMessage> get messages => _messages;

  String get errorMessage => _errorMessage;

  bool get isGenerating => _isGenerating;

  /// 加载会话;`simulateFailure` 供演示失败态使用。
  Future<void> load({bool simulateFailure = false}) async {
    _abortTurn();
    _view = ConsoleView.loading;
    _errorMessage = '';
    _notify();

    final Result<contract.Conversation> result =
        await _repository.loadConversation(simulateFailure: simulateFailure);

    if (_disposed) return;

    switch (result) {
      case Ok<contract.Conversation>(:final contract.Conversation value):
        _messages = value.messages;
        _view = value.messages.isEmpty ? ConsoleView.empty : ConsoleView.ready;
      case Err<contract.Conversation>(:final String message):
        _errorMessage = message;
        _view = ConsoleView.error;
    }
    _notify();
  }

  /// 发送一条用户消息,并立刻开始 agent 回合。
  void send(String text) {
    final String trimmed = text.trim();
    if (trimmed.isEmpty || _isGenerating) return;

    final contract.AgentMessage agentMessage =
        MessageOps.agentMessage(id: 'm-${++_sequence}');
    _messages = <contract.AgentMessage>[
      ..._messages,
      MessageOps.userMessage(id: 'm-${++_sequence}', text: trimmed),
      agentMessage,
    ];
    _view = ConsoleView.ready;
    _startTurn(input: trimmed, agentMessageId: agentMessage.id);
  }

  /// 中止当前生成;已生成的内容保留,状态落到 aborted。
  void abort() {
    _turn?.abort();
  }

  /// 重新生成:复用该 agent 消息之前最近的一条用户消息作为输入,原地替换该条回复。
  void regenerate(String agentMessageId) {
    if (_isGenerating) return;

    final int index = _messages.indexWhere(
      (contract.AgentMessage message) => message.id == agentMessageId,
    );
    if (index < 0) return;

    final int userIndex = _lastUserIndexBefore(index);
    if (userIndex < 0) return;

    final List<contract.AgentMessage> next = <contract.AgentMessage>[..._messages];
    next[index] = MessageOps.agentMessage(id: agentMessageId);
    _messages = next;

    _startTurn(input: _messages[userIndex].text, agentMessageId: agentMessageId);
  }

  /// 回应审批请求;回合会从阻塞处继续。
  void resolveApproval({required bool approved}) {
    _turn?.resolveApproval(approved: approved);
  }

  /// 清空会话,回到空态。
  void clear() {
    _abortTurn();
    _messages = const <contract.AgentMessage>[];
    _view = ConsoleView.empty;
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _abortTurn();
    super.dispose();
  }

  void _startTurn({required String input, required String agentMessageId}) {
    _abortTurn();
    _isGenerating = true;

    final AgentTurn turn = _repository.startTurn(input);
    _turn = turn;
    _subscription = turn.events.listen(
      (AgentEvent event) => _apply(agentMessageId, event),
      onDone: () {
        _isGenerating = false;
        _turn = null;
        _notify();
      },
    );
    _notify();
  }

  void _apply(String agentMessageId, AgentEvent event) {
    switch (event) {
      case ReasoningAdded(:final contract.ReasoningStep step):
        _update(agentMessageId, (contract.AgentMessage m) => MessageOps.addReasoning(m, step));
      case TextAppended(:final String chunk):
        _update(
          agentMessageId,
          (contract.AgentMessage m) => MessageOps.withText(m, m.text + chunk),
        );
      case ToolCallChanged(:final contract.ToolCall call):
        _update(agentMessageId, (contract.AgentMessage m) => MessageOps.putToolCall(m, call));
      case ApprovalChanged(:final contract.ApprovalRequest request):
        _update(agentMessageId, (contract.AgentMessage m) => MessageOps.withApproval(m, request));
      case TurnEnded(:final contract.MessageStatus status):
        _update(agentMessageId, (contract.AgentMessage m) => MessageOps.withStatus(m, status));
        _isGenerating = false;
    }
  }

  void _update(
    String agentMessageId,
    contract.AgentMessage Function(contract.AgentMessage message) transform,
  ) {
    final int index = _messages.indexWhere(
      (contract.AgentMessage message) => message.id == agentMessageId,
    );
    if (index < 0) return;

    final List<contract.AgentMessage> next = <contract.AgentMessage>[..._messages];
    next[index] = transform(next[index]);
    _messages = next;
    _notify();
  }

  int _lastUserIndexBefore(int index) {
    for (int i = index - 1; i >= 0; i--) {
      if (_messages[i].role == contract.Role.USER) return i;
    }
    return -1;
  }

  void _abortTurn() {
    _turn?.abort();
    _turn = null;
    unawaited(_subscription?.cancel());
    _subscription = null;
    _isGenerating = false;
  }

  void _notify() {
    if (_disposed) return;
    notifyListeners();
  }
}
