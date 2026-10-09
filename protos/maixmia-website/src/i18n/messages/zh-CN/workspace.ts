// 工作台展示文案与确定性的演示应答。
export const workspace = {
  title: '工作台',
  newChat: '新建对话',
  // 侧栏 Agent 选择器:触发钮的完整名走 agents 表,这里只给弹层的可访问名与当前项标记词。
  // 选择器表达的是「当前在哪个 Agent 下工作」——它决定侧栏能看到哪些项目。
  agentSelector: '切换 Agent',
  agentSelected: '已选',
  // 侧栏:Agent 工作区面板,其下是项目区(项目列表 + 打开项目),不再是工作区文件。
  workspacePanel: 'Agent 工作区',
  openSidebar: '打开侧栏',
  closeSidebar: '关闭侧栏',
  closeTab: '关闭 {title}',
  // 项目区:每个项目是 Agent Host 上的一个目录(CLI 运行的 cwd),展开后是它的文件树。
  projects: '项目',
  projectsEmpty: '还没有打开的项目',
  projectsError: '项目列表加载失败',
  openProject: '打开项目',
  closeProject: '关闭项目',
  // 项目行的「⋯」操作菜单的可访问名。(原 expandProject / collapseProject 已随目录行改用
  // 「整行 button + aria-expanded」而下线,不再有「动作词 + 项目名」拼出的可访问名。)
  projectActions: '项目操作',
  treeLoading: '正在加载文件…',
  treeEmpty: '这个项目还没有文件',
  treeError: '项目文件加载失败',
  // 「打开项目」对话框:列出 Agent Host 上检测到的目录,可搜索、可勾选打开。
  pickerTitle: '打开项目',
  pickerSearch: '搜索目录',
  pickerEmpty: '没有检测到可打开的目录',
  pickerSearchEmpty: '没有匹配的目录',
  // 候选目录的文件数;{count} 由载体替换。
  fileCount: '{count} 个文件',
  pickerGit: 'Git 仓库',
  pickerAlreadyOpen: '已打开',
  pickerOpen: '打开',
  pickerCancel: '取消',
  // 对话切换器:会话头右上角的「对话 ▾」下拉。触发钮可见文字、面板可访问名同取此名。
  conversations: '对话',
  searchConversations: '搜索对话',
  // 搜索框的可见占位文案:面板宽 420px,容得下完整句,故恢复成完整的「搜索对话」。
  // 可访问名同样是 searchConversations(完整、且是测试与屏幕阅读器依赖的稳定名)。
  searchPlaceholder: '搜索对话',
  clearSearch: '清空搜索',
  searchEmpty: '没有匹配的对话',
  // 命中理由:标题命中没有可跳转的具体轮次,正文命中可跳到该轮并高亮。
  matchTitle: '标题命中',
  matchBody: '正文命中',
  // 触发钮上的徽标:数字 + 可访问名补足语义(可见文字只有「对话」,读屏需要知道在等什么)。
  awaitingCount: '{count} 个等待确认',
  // 会话头右侧的菜单钮(常驻):它是溢出 tab 的入口,也是搜索入口,故图上图标。aria-label
  // 由三段拼成 —— 基础名 + (有收起时)已收起条数 + (其中有等待时)等待确认条数。
  conversationMenu: '所有对话与搜索',
  hiddenCount: '{count} 条已收起',
  hiddenAwaiting: '其中 {count} 条等待确认',
  // tab 拖拽 / 快捷键重排后的无视觉反馈补充:面向屏幕阅读器的 aria-live 播报。
  // {title} 是会话标题,{index} 是 1 基的目标位次,{total} 是打开集总数。
  tabMoved: '{title} 已移到第 {index} 位,共 {total} 位',
  // 面板里的两个分组:置顶的「等待你」组(等在等你、且你还未打开过)与「本项目」组(其余会话)。
  awaitingGroup: '等待你 · {count}',
  projectGroup: '本项目 · {count}',
  current: '当前对话',
  you: '你',
  assistant: 'Mia',
  transcript: '对话记录',
  loading: '正在加载对话…',
  emptyTitle: '一舟，今天一起完成什么？',
  emptyBody: '从一个想法开始。告诉 Mia 你的目标，我们一起把下一步理清楚。',
  suggestions: {
    plan: { title: '拆解一项任务', body: '帮我把团队知识库整理工作拆成一周内可执行的计划。' },
    write: { title: '整理会议记录', body: '我想整理今天的项目会议记录，请先给我一个包含决策和待办的模板。' },
    explore: { title: '一起推敲想法', body: '我准备做一个每周自动汇总项目进展的 Agent，帮我明确它的输入和输出。' },
  },
  inputLabel: '给 Mia 的消息',
  placeholder: '描述你的任务，或接着聊…',
  inputHint: 'Enter 发送 · Shift+Enter 换行',
  stop: '停止生成',
  regenerate: '重新生成',
  queued: '正在思考…',
  backToBottom: '回到底部',
  errorTitle: '暂时无法加载对话',
  errorBody: '演示连接暂时中断。重试后即可继续这段对话。',
  retry: '重试',
  sessionsEmpty: '这个项目还没有对话',
  sessionsError: '对话列表加载失败',
  sendError: '消息暂未发送，请重试。',
  invalidSession: '找不到这段对话',
  invalidProject: '找不到这个项目',
  unknownDirectory: '找不到这个目录',
  emptyMessage: '请先输入消息',
  invalidAgent: '找不到这个 Agent',
  noConfirmation: '当前没有待确认的操作',
  sessions: {
    weekly: '把项目周报整理成行动清单',
    roadmap: '梳理下季度路线图',
    incident: '复盘线上故障处理',
    budget: '核对本季度预算使用',
    launch: '新功能发布前的检查清单',
    hiring: '整理招聘面试反馈',
    research: '用户访谈：整理关键发现',
    knowledge: '团队知识库的整理计划',
    quarterly: '生成季度复盘数据',
  },
  // 会话列表的次要行(mock 用):便于扫读这段对话讲了什么。
  previews: {
    weekly: '整理本周进展，排好周五演示的 15 分钟',
    roadmap: '按目标、资源、风险三层收敛',
    incident: '先记录时间线，再谈改进项',
    budget: '分线核对已用与剩余额度',
    launch: '发布前四项检查：触发、文案、入口、异常',
    hiring: '统一面试评价的结构与口径',
    research: '保留「原话 → 观察 → 假设」三层',
    knowledge: '先从最近两周最常被问的五个问题开始',
    quarterly: '按各条线的实际进展回填季度排期',
  },
  // 项目条目的状态芯片文案。none 不渲染芯片(无变化,不占宽度);pending 只在等待交互、
  // 该条目受影响时出现。
  entryStates: {
    created: '新建',
    modified: '已修改',
    pending: '待确认',
  },
  // 运行遥测:输入框下方单行状态条的可访问名与分组标签。
  telemetry: {
    label: '运行状态',
    context: '上下文用量',
  },
  // 状态词:客户端实时生成状态优先(排队→思考中、流式→输出中、停止/完成),
  // 空闲时回落取 AgentRuntime.status(含等待确认)。词本身不含具体动作,动作由 statusDetails 给。
  statusWords: {
    idle: '空闲',
    thinking: '思考中',
    streaming: '输出中',
    waiting: '等待确认',
    stopped: '已停止',
    complete: '已生成',
  },
  // 会话状态的词:与契约 SessionStatus 一一对应,用于 tab 的 title(鼠标悬停可读)与状态图标。
  // 「未看过」是视图状态,不在这里表达 —— 它决定 awaiting / completed 的图标是否显示。
  sessionStatus: {
    new: '新会话',
    streaming: '响应中',
    awaiting: '等待交互',
    completed: '响应完成',
    idle: '等待对话',
  },
  // 运行遥测的具体动作文案:mock 给出键(statusDetail)，载体按此解析 —— 不允许「处理中」这类模糊词。
  statusDetails: {
    summarizing: '正在汇总本周项目进展',
    draftingOutline: '正在起草访谈提纲',
    revisingRelease: '正在改写发布说明',
    awaitingConfirm: '等待你确认文件改写',
  },
  // 客户端生成状态的具体动作文案:客户端状态没有运行时动作可读,故在此补齐成对的动作词。
  // 状态项恒为「状态词 · 具体动作」两段式,这段动作在 Agent 干活时给用户最需要的「正在做什么」。
  // idle 只在确认被拒后由本地覆盖状态给出 —— 此时运行时的动作已过期,改用它自己那条诚实的词。
  statusActions: {
    queued: '正在梳理你的请求',
    streaming: '正在撰写回复',
    stopped: '已停止输出',
    complete: '本轮回复已写完',
    idle: '等待你的下一条指令',
  },
  // 「等待交互」确认请求(mock 用)与确认卡的交互文案。文件名是技术标识,两种语言共用同一写法。
  confirmation: {
    title: '需要你的确认',
    summary: '用新草稿改写「release-notes.md」',
    detail: '将把刚生成的版本写回「release-notes.md」，原有内容会被替换，且无法从项目目录恢复。',
    affectedFiles: '受影响的文件',
    viewDetail: '查看详情',
    hideDetail: '收起详情',
    allow: '允许',
    reject: '拒绝',
    // 处理后卡片塌缩成的一行留痕(审计痕迹,不消失)。
    allowed: '已允许',
    rejected: '已拒绝',
    // 处理后 Agent 的后续消息:允许则继续按新草稿走,拒绝则改走另一条路。
    followUpAllowed: '已按新草稿改写「release-notes.md」，并同步更新了引用它的三处链接。',
    followUpRejected: '已放弃这次改写，改为只输出一份对照稿，原文件保持不变。',
    // 第二个「等待交互」会话(quarterly)的确认请求文案,与它自己的受影响文件对齐。
    quarterlySummary: '用最新数据重写「release-plan.csv」',
    quarterlyDetail: '将把本周的实际进展回填进「release-plan.csv」的计划列，现有排期会被覆盖，且无法从项目目录恢复。',
  },
  // 工作台里的 Agent 名称:会话头副行显示当前会话归属的 Agent。
  agents: {
    planning: '规划助手',
    research: '研究助手',
    writing: '写作助手',
  },
  messages: {
    weeklyUser1: 'Mia，帮我整理本周的项目进展。我们完成了登录流程和通知原型，知识库整理还没启动。周五要做一次团队演示。',
    weeklyAssistant1: '可以，先把进展和下一步分开。\n\n已完成\n登录流程与通知原型已具备演示条件。建议各准备一条完整操作路径，避免演示时临时找入口。\n\n待推进\n知识库整理尚未启动。本周先确认文档范围和负责人，不必急着搬迁所有资料。\n\n周五演示\n围绕“进入工作台 → 发起任务 → 收到通知”这条主线讲解，让团队先理解完整体验。',
    weeklyUser2: '演示只有 15 分钟。帮我排个顺序，也把周五之前需要做的事情列出来。',
    weeklyAssistant2: '建议把 15 分钟分成三个部分，留出讨论空间。\n\n1. 目标与背景 · 2 分钟\n说明这次原型要验证什么：任务能否顺畅发起，结果通知是否清楚。\n\n2. 一条完整任务路径 · 8 分钟\n由林一舟演示登录、进入工作台、发起任务，再展示通知原型。只走一条主线，把分支问题记下来。\n\n3. 收集反馈与下一步 · 5 分钟\n请大家各说一个不清楚的地方，按“阻塞任务 / 可以稍后优化”分类。\n\n周五前的行动清单\n• 周三：准备一组演示数据，确认账号与入口。\n• 周四：完整彩排一次，把主线控制在 8 分钟内。\n• 周五演示前：检查通知文案，准备静态备份。\n\n知识库可以先收集文档链接和负责人，下周再集中整理。要不要继续把这份清单改成一段发给团队的通知？',
    researchUser: '把用户访谈整理成结论时，怎样避免把个别意见当成普遍需求？',
    researchAssistant: '建议保留“原话 → 观察 → 假设”三层。每个发现标明来自几位受访者、发生在什么任务中，再找反例。\n\n先记录行为与场景，再写解释；把尚未验证的判断单独列出。下一轮访谈可以专门验证这些假设，而不是急着给它们定优先级。',
    launchUser: '我们下周发布通知功能，帮我列一下发布前必须检查的事情。',
    launchAssistant: '可以先检查四项：\n\n• 触发条件：成功、失败和取消任务是否有明确边界。\n• 文案：用户能否看懂发生了什么，以及接下来做什么。\n• 入口：点通知后是否能回到对应任务。\n• 异常：通知未送达时，工作台中能否找到任务结果。\n\n最后用一个全新账号走完流程，并准备回退说明。',
    roadmapUser: '帮我把下季度的路线图梳理出来，手头积压了不少需求。',
    roadmapAssistant: '可以，先定取舍标准再排顺序。\n\n目标\n明确下季度要拿下的两三件大事，其余明确标注「不做」。\n\n资源\n按现有团队规模估算，宁可少排也不要透支。\n\n风险\n依赖外部团队的部分单独列出，给它们留出缓冲。',
    incidentUser: '上周那次线上故障，帮我整理一份复盘。',
    incidentAssistant: '先用时间线把事实钉清楚，再谈改进。\n\n时间线\n从首次告警到恢复，逐条写清发生了什么、谁做了什么。\n\n影响\n给出受影响的用户范围与时长，不夸大也不缩小。\n\n改进项\n只保留能落到人、能定时间的三条以内，避免列成愿望清单。',
    budgetUser: '本季度预算用得差不多了，帮我核对各条线的使用情况。',
    budgetAssistant: '按线分别核对，避免只看总数。\n\n归口\n产品、增长、基建三条线各自汇总已用与剩余。\n\n异常\n把超出预期比例的项目单独标出，先问原因再判断是否合理。\n\n结论\n剩余额度集中到下一季度关键项上，不做平均分配。',
    hiringUser: '面试安排有点乱，帮我整理一下反馈汇总的口径。',
    hiringAssistant: '先统一评价结构，再汇总。\n\n结构\n每轮面试按「结论、证据、风险」三段写，避免只写感觉。\n\n口径\n对同一能力项使用一致的描述，不因人而异。\n\n汇总\n给出是否推进的明确建议，并标注需要额外验证的点。',
    knowledgeUser: '团队文档越来越多，怎样开始整理才不会变成一个大工程？',
    knowledgeAssistant: '先从最近两周最常被问到的五个问题开始。\n\n找出对应文档，补齐负责人和更新时间；保留原链接，建立一个轻量索引。暂时不移动所有文件，也不设计复杂分类。\n\n用一周观察大家能否更快找到答案，再决定要不要扩大整理范围。',
    quarterlyUser: '季度快过去了，帮我把这个季度的复盘数据整理出来。',
    quarterlyAssistant: '可以，先把数据口径定下来。\n\n时间范围\n按自然季度取 7–9 月，并注明数据截止日。\n\n分线归集\n按产品、增长、基建三条线分别汇总投入与产出，不要混在一起。\n\n待确认\n回填到「release-plan.csv」前需要你确认口径，我不会把假设当成事实。',
  },
  responses: {
    first: '可以，我们先把目标收敛成一份能直接使用的草稿。\n\n第一步：明确结果\n写下这项任务完成后要交付什么，以及谁会使用它。先保证内容可用，再打磨形式。\n\n第二步：列出最小行动\n把准备资料、整理初稿、共同确认分开。每项只保留一个明确的输出，避免把多个目标塞进同一步。\n\n第三步：安排一次检查\n预留时间核对信息、负责人和截止日期；不确定的内容单独标注，不替团队做未经确认的决定。\n\n这是一份演示建议，尚未执行外部操作。你可以告诉我最需要细化的部分，我们继续往下拆。',
    second: '我们可以把它整理成一个更方便协作的版本。\n\n目标\n用一句话说明要解决的问题，并附上可检查的完成标准。\n\n分工\n每项任务明确一位负责人；需要其他人确认的地方，写清楚问题与期望答复时间。\n\n节奏\n先完成最小草稿，再做一次短评审。把新增想法放到后续清单，不挤占当前任务。\n\n待确认\n目前还需要具体的截止日期和参与者。我不会把这些假设当成事实；你补充后，我们再更新计划。',
    third: '下面是一段可以继续编辑的团队通知草稿：\n\n大家好，本周我们会围绕当前原型做一次简短演示，重点关注任务入口、操作过程和结果反馈。\n\n演示前请准备各自负责部分的最新材料，并把尚未确定的问题单独列出。演示时先走完整主线，结束后集中讨论。\n\n讨论结果会整理为行动清单，确认每一项的负责人和下一次检查时间。\n\n这段文字尚未发送给任何人。你可以补充时间、参会范围和链接后再使用。',
  },
}
