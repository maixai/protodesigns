import 'dart:async';

import '../contracts/generated/conversation.dart' as contract;
import 'result.dart';

/// 模拟一次本地读写延迟:与 web 侧 src/mocks/delay.ts 一致,150-300ms 随机延迟。
Future<void> _networkDelay() {
  final int span = DateTime.now().microsecondsSinceEpoch % 151;
  return Future<void>.delayed(Duration(milliseconds: 150 + span));
}

// -----------------------------------------------------------------------------
// 回合事件:agent 的一轮回复被拆成事件流,控制器按事件增量更新消息。
// -----------------------------------------------------------------------------

/// agent 回合中产生的事件。
sealed class AgentEvent {
  const AgentEvent();
}

/// 新增一条思考步骤。
final class ReasoningAdded extends AgentEvent {
  const ReasoningAdded(this.step);

  final contract.ReasoningStep step;
}

/// 流式正文增量(1-3 个字符)。
final class TextAppended extends AgentEvent {
  const TextAppended(this.chunk);

  final String chunk;
}

/// 工具调用状态变化(running → succeeded / failed)。
final class ToolCallChanged extends AgentEvent {
  const ToolCallChanged(this.call);

  final contract.ToolCall call;
}

/// 审批请求状态变化(pending → approved / rejected)。
final class ApprovalChanged extends AgentEvent {
  const ApprovalChanged(this.request);

  final contract.ApprovalRequest request;
}

/// 回合结束;状态只会是 done / aborted / failed。
final class TurnEnded extends AgentEvent {
  const TurnEnded(this.status);

  final contract.MessageStatus status;
}

/// 一次可中止的 agent 回合:调用方持有它,既能消费事件流,也能中止或回应审批。
class AgentTurn {
  AgentTurn._(this._runner);

  final _TurnRunner _runner;

  Stream<AgentEvent> get events => _runner.events;

  /// 立即中止:未完成的等待会被打断,已生成的内容由调用方保留。
  void abort() => _runner.abort();

  /// 回应审批请求,解除流程阻塞。
  void resolveApproval({required bool approved}) => _runner.resolveApproval(approved);
}

// -----------------------------------------------------------------------------
// 剧本:原型期用它替代真实模型,让演示可复现。
// -----------------------------------------------------------------------------

class _ReasoningPlan {
  const _ReasoningPlan(this.text, this.durationMs);

  final String text;
  final int durationMs;
}

class _ToolPlan {
  const _ToolPlan({
    required this.name,
    required this.arguments,
    required this.runMs,
    this.result = '',
    this.error = '',
  });

  final String name;
  final Map<String, String> arguments;
  final int runMs;
  final String result;
  final String error;
}

class _ApprovalPlan {
  const _ApprovalPlan({
    required this.action,
    required this.summary,
    required this.arguments,
    required this.risk,
  });

  final String action;
  final String summary;
  final Map<String, String> arguments;
  final contract.Risk risk;
}

/// 一轮回复的剧本:思考 → 工具 → (审批) → 流式正文。
class _Script {
  const _Script({
    required this.reasoning,
    required this.reply,
    this.tools = const <_ToolPlan>[],
    this.approval,
    this.rejectedReply = '',
    this.approvedTools = const <_ToolPlan>[],
  });

  final List<_ReasoningPlan> reasoning;
  final List<_ToolPlan> tools;
  final _ApprovalPlan? approval;
  final String reply;
  final String rejectedReply;
  final List<_ToolPlan> approvedTools;
}

/// 中止信号:内部使用,用于从任意 await 点立即退出剧本。
class _TurnAborted implements Exception {
  const _TurnAborted();
}

// -----------------------------------------------------------------------------
// 回合执行器
// -----------------------------------------------------------------------------

class _TurnRunner {
  _TurnRunner(this._script);

  final _Script _script;
  final StreamController<AgentEvent> _controller = StreamController<AgentEvent>();
  final Completer<void> _abortSignal = Completer<void>();

  Completer<bool>? _pendingApproval;
  bool _aborted = false;
  int _seq = 0;

  Stream<AgentEvent> get events => _controller.stream;

  void start() {
    unawaited(_run());
  }

  void abort() {
    if (_aborted) return;
    _aborted = true;
    if (!_abortSignal.isCompleted) {
      _abortSignal.complete();
    }
    // 解除审批阻塞:被中止的回合视为"未批准"。
    final Completer<bool>? pending = _pendingApproval;
    if (pending != null && !pending.isCompleted) {
      pending.complete(false);
    }
  }

  void resolveApproval(bool approved) {
    final Completer<bool>? pending = _pendingApproval;
    if (pending != null && !pending.isCompleted) {
      pending.complete(approved);
    }
  }

  Future<void> _run() async {
    contract.MessageStatus status = contract.MessageStatus.DONE;
    try {
      await _perform();
    } on _TurnAborted {
      status = contract.MessageStatus.ABORTED;
    } on Object {
      status = contract.MessageStatus.FAILED;
    }
    if (!_controller.isClosed) {
      _controller.add(TurnEnded(status));
      await _controller.close();
    }
  }

  Future<void> _perform() async {
    for (final _ReasoningPlan plan in _script.reasoning) {
      await _sleep(plan.durationMs);
      _emit(
        ReasoningAdded(
          contract.ReasoningStep(id: 'r-${++_seq}', text: plan.text, durationMs: plan.durationMs),
        ),
      );
    }

    for (final _ToolPlan plan in _script.tools) {
      await _runTool(plan);
    }

    String reply = _script.reply;
    final _ApprovalPlan? approvalPlan = _script.approval;
    if (approvalPlan != null) {
      final bool approved = await _askApproval(approvalPlan);
      if (approved) {
        for (final _ToolPlan plan in _script.approvedTools) {
          await _runTool(plan);
        }
      } else {
        reply = _script.rejectedReply;
      }
    }

    await _streamText(reply);
  }

  /// 跑一个工具:先以 running 态出现,等待 runMs 后落到成功或失败。
  Future<void> _runTool(_ToolPlan plan) async {
    final String id = 't-${++_seq}';
    final Map<String, String> arguments = plan.arguments;
    _emit(
      ToolCallChanged(
        contract.ToolCall(
          id: id,
          name: plan.name,
          arguments: arguments,
          result: '',
          toolStatus: contract.Tool.RUNNING,
          at: DateTime.now(),
        ),
      ),
    );

    await _sleep(plan.runMs);

    final bool failed = plan.error.isNotEmpty;
    _emit(
      ToolCallChanged(
        contract.ToolCall(
          id: id,
          name: plan.name,
          arguments: arguments,
          result: failed ? plan.error : plan.result,
          toolStatus: failed ? contract.Tool.FAILED : contract.Tool.SUCCEEDED,
          at: DateTime.now(),
        ),
      ),
    );
  }

  /// 请求审批:**真正阻塞在这里**,直到调用方回应或回合被中止。
  Future<bool> _askApproval(_ApprovalPlan plan) async {
    final Completer<bool> decision = Completer<bool>();
    _pendingApproval = decision;

    final String id = 'a-${++_seq}';
    _emit(ApprovalChanged(_buildApproval(plan, id, contract.Approval.PENDING)));

    final bool approved = await decision.future;
    _requireRunning();
    _pendingApproval = null;

    _emit(
      ApprovalChanged(
        _buildApproval(
          plan,
          id,
          approved ? contract.Approval.APPROVED : contract.Approval.REJECTED,
        ),
      ),
    );
    return approved;
  }

  contract.ApprovalRequest _buildApproval(
    _ApprovalPlan plan,
    String id,
    contract.Approval status,
  ) {
    return contract.ApprovalRequest(
      id: id,
      action: plan.action,
      summary: plan.summary,
      arguments: plan.arguments,
      risk: plan.risk,
      approvalStatus: status,
    );
  }

  /// 逐字吐出正文:每个 tick 1-3 个字符,整体约 2-4 秒。
  Future<void> _streamText(String text) async {
    int index = 0;
    int tick = 0;
    while (index < text.length) {
      final int end = (index + 1 + tick % 3).clamp(0, text.length);
      _emit(TextAppended(text.substring(index, end)));
      index = end;
      tick++;
      await _sleep(52);
    }
  }

  /// 可被打断的等待:任一时长都会被 abort 立刻打断。
  Future<void> _sleep(int milliseconds) async {
    _requireRunning();
    await Future.any<void>(<Future<void>>[
      Future<void>.delayed(Duration(milliseconds: milliseconds)),
      _abortSignal.future,
    ]);
    _requireRunning();
  }

  void _requireRunning() {
    if (_aborted) throw const _TurnAborted();
  }

  void _emit(AgentEvent event) {
    if (!_controller.isClosed) {
      _controller.add(event);
    }
  }
}

// -----------------------------------------------------------------------------
// 仓库
// -----------------------------------------------------------------------------

/// Agent 数据访问层:原型期用内置剧本模拟一次完整的 agent 回合,
/// 不接真实模型、不做持久化,刷新即重置。
class AgentRepository {
  const AgentRepository();

  /// 读取会话。`simulateFailure` 供演示失败态与重试路径使用。
  Future<Result<contract.Conversation>> loadConversation({
    bool simulateFailure = false,
  }) async {
    await _networkDelay();
    if (simulateFailure) {
      return const Err<contract.Conversation>('会话加载失败:本地模拟服务无响应。');
    }
    return Ok<contract.Conversation>(
      contract.Conversation(
        id: 'c-001',
        title: '新会话',
        messages: const <contract.AgentMessage>[],
      ),
    );
  }

  /// 发起一轮 agent 回复。
  AgentTurn startTurn(String userText) {
    return AgentTurn._(_TurnRunner(_scriptFor(userText))..start());
  }

  /// 关键词路由:把用户输入映射到一段可复现的剧本。
  _Script _scriptFor(String userText) {
    if (_containsAny(userText, const <String>['清理', '删除', '清除', '归档'])) {
      return _purgeScript;
    }
    if (_containsAny(userText, const <String>['统计', '汇总', '总额', '指标', '多少'])) {
      return _analyticsScript;
    }
    return _searchScript;
  }

  bool _containsAny(String text, List<String> keywords) {
    return keywords.any(text.contains);
  }
}

// -----------------------------------------------------------------------------
// 剧本内容:贴近真实业务的文案与参数,不用占位文本。
// -----------------------------------------------------------------------------

const _Script _searchScript = _Script(
  reasoning: <_ReasoningPlan>[
    _ReasoningPlan('先判断问题类型:这是一条政策咨询,需要从内部知识库找依据,而不是查业务库。', 320),
    _ReasoningPlan('把检索关键词定为「退款政策」「到账周期」,再取相似度最高的几篇。', 280),
    _ReasoningPlan('核对命中结果与问题是否对得上,然后组织回答。', 240),
  ],
  tools: <_ToolPlan>[
    _ToolPlan(
      name: 'search_docs',
      arguments: <String, String>{'query': '退款政策 到账周期', 'top_k': '5', 'scope': 'handbook'},
      runMs: 900,
      result: '命中 5 篇文档,最相关:《退款与换货政策 v3.2》(相似度 0.91)',
    ),
  ],
  reply: '根据《退款与换货政策 v3.2》,标准订单在签收后 7 个自然日内可以申请无理由退款,'
      '款项会在审核通过后的 3–5 个工作日退回原支付渠道。\n\n'
      '有两类例外:定制类商品一经生产就不再支持无理由退款;超过 7 天的订单只能走质量问题的售后通道。'
      '需要我把例外条款的完整清单也列出来吗?',
);

const _Script _analyticsScript = _Script(
  reasoning: <_ReasoningPlan>[
    _ReasoningPlan('这是一条聚合统计请求,先确认口径:按渠道拆分,时间范围是上个月。', 400),
    _ReasoningPlan('统计口径各团队定义不一致,先检索指标定义再动手查。', 300),
    _ReasoningPlan('口径确认后执行查询,取回上月分渠道金额。', 260),
  ],
  tools: <_ToolPlan>[
    _ToolPlan(
      name: 'search_docs',
      arguments: <String, String>{'query': '订单总额 指标口径 渠道', 'top_k': '3'},
      runMs: 820,
      result: '命中 3 篇,《经营指标口径说明》定义:订单总额 = 已支付且未退款的订单金额之和',
    ),
    _ToolPlan(
      name: 'run_query',
      arguments: <String, String>{
        'datasource': 'warehouse',
        'sql': 'select channel, sum(amount) as total from orders '
            "where paid_at >= '2026-09-01' and paid_at < '2026-10-01' "
            'and refunded = false group by channel',
      },
      runMs: 1100,
      error: '查询超时:orders 表 9 月分区扫描量超过 200GB,已中止执行(statement_timeout=30s)',
    ),
  ],
  reply: '这次统计没能跑完:`run_query` 在全表扫描时触发了 30 秒超时,9 月分区的数据量比预期大很多。\n\n'
      '口径说明已经拿到了——订单总额按「已支付且未退款」的金额之和计算。'
      '建议改成按渠道并行查询,或者先落到按天聚合的中间表再汇总。要我按这个思路重新发起一次查询吗?',
);

const _Script _purgeScript = _Script(
  reasoning: <_ReasoningPlan>[
    _ReasoningPlan('请求涉及清理运行日志,属于不可逆的删除操作。', 320),
    _ReasoningPlan('先查一次日志保留策略,确认待删除的时间边界是否合规。', 300),
    _ReasoningPlan('这是一次高危操作,按安全策略必须先取得用户批准,不能直接执行。', 260),
  ],
  tools: <_ToolPlan>[
    _ToolPlan(
      name: 'search_docs',
      arguments: <String, String>{'query': '日志保留策略 保留天数', 'top_k': '3'},
      runMs: 760,
      result: '《日志保留策略》规定:生产环境运行日志保留 30 天,超期数据可清理',
    ),
  ],
  approval: _ApprovalPlan(
    action: 'purge_logs',
    summary: '删除 runtime_logs 表中 30 天前的全部记录(硬删除,不可恢复)',
    arguments: <String, String>{
      'table': 'runtime_logs',
      'before': '2026-09-04',
      'mode': 'hard_delete',
      'batch_size': '5000',
    },
    risk: contract.Risk.HIGH,
  ),
  approvedTools: <_ToolPlan>[
    _ToolPlan(
      name: 'purge_logs',
      arguments: <String, String>{
        'table': 'runtime_logs',
        'before': '2026-09-04',
        'mode': 'hard_delete',
      },
      runMs: 1200,
      result: '已删除 1 284 317 行,释放 2.4 GB;操作已写入审计日志 audit-2026-10-04-0731',
    ),
  ],
  reply: '清理完成,共删除 1 284 317 行历史日志,释放约 2.4 GB 空间。'
      '本次操作已写入审计日志,记录保留 180 天。\n\n'
      '后续建议把这个清理动作挂成定时任务,避免每次手工触发。',
  rejectedReply: '已取消,没有删除任何数据,runtime_logs 表保持原样。\n\n'
      '如果只是想控制存储增长,可以先做一次归档:把 30 天前的日志转到冷存储,'
      '确认无误之后再删除,这样随时可以回滚。需要我改成归档方案吗?',
);
