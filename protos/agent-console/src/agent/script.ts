// 会话脚本数据:一次"真实感"的 agent 运行所需的静态文案、工具参数与 diff。
// 引擎(src/agent/session.ts)按节拍消费这些数据,把它们变成转录流里的一行行内容。
// 所有内容均为 dummy,刷新即重置,不接真实后端。
import type { DiffBlock, ThinkingStep } from '../api/agent.types'

// 会话元信息里的模型名与工作目录(状态行展示)。
export const MODEL_NAME = '青瓷-agent v1'
export const WORKING_DIR = '~/workspaces/maixai/protodesigns'

// 空态引导:点击任一条即作为用户指令发起一轮会话。
export const EXAMPLE_PROMPTS: readonly string[] = [
  '把强调色统一成青瓷绿,并让主题跟随系统深浅色',
  '整理 design token,顺便跑一遍测试',
  '改完主题后帮我推送到 main',
]

// 思考步骤:被 ThinkingEntry 引用,逐条吐出。
export const THINKING_STEPS: readonly ThinkingStep[] = [
  { index: 1, text: '定位主题与 design token 模块' },
  { index: 2, text: '核对强调色的当前取值与全部引用点' },
  { index: 3, text: '规划改动,并准备一次验证运行' },
]

// Read(src/theme.ts) 的结果:文件内容摘录。
export const READ_RESULT = `export const themeOverrides = {
  common: {
    primaryColor: '#3f8a7c',
    primaryColorHover: '#63a79a',
    fontSize: 15,
    borderRadius: 6,
  },
}`

// Grep("accent", src/) 的结果:匹配行列表。
export const GREP_RESULT = `src/theme.ts:14    primaryColor: '#3f8a7c',
src/theme.ts:15    primaryColorHover: '#63a79a',
src/components/button.vue:22  color: var(--dl-accent);
src/style.css:39  --dl-accent: var(--dl-accent-600);
4 处匹配,涉及 3 个文件`

// Edit(src/theme.ts) 的 unified diff:把强调色从旧值改成青瓷绿,并对齐圆角。
// line 号同时给出旧行号与新行号,供 diff 视图左右两列渲染。
export const THEME_DIFF: DiffBlock = {
  file: 'src/theme.ts',
  lines: [
    { kind: 'context', oldLine: 12, newLine: 12, text: 'export const themeOverrides = {' },
    { kind: 'context', oldLine: 13, newLine: 13, text: '  common: {' },
    { kind: 'removed', oldLine: 14, newLine: null, text: "    primaryColor: '#3f8a7c'," },
    { kind: 'added', oldLine: null, newLine: 14, text: "    primaryColor: '#2e6f63'," },
    { kind: 'context', oldLine: 15, newLine: 15, text: '    fontSize: 15,' },
    { kind: 'removed', oldLine: 16, newLine: null, text: '    borderRadius: 6,' },
    { kind: 'added', oldLine: null, newLine: 16, text: '    borderRadius: 8,' },
    { kind: 'context', oldLine: 17, newLine: 17, text: '  },' },
    { kind: 'context', oldLine: 18, newLine: 18, text: '}' },
  ],
}

// Edit 成功后的摘要结果。
export const EDIT_RESULT = '已应用 2 处改动:primaryColor 与 borderRadius'

// 首次 agent 文本:改动完成,准备验证。
export const TEXT_AFTER_EDIT =
  '主题模块已更新:强调色统一为青瓷绿,圆角对齐设计规范。先跑一遍测试确认没有回归。'

// Bash(pnpm test) 的非零退出输出:一次与本次改动无关的既有 snapshot 差异。
export const TEST_FAIL_RESULT = ` RUN  v3.2.1 /Users/zach/workspaces/maixai/protodesigns

 ❯ tests/calibrate/calibrate.spec.ts (8 tests | 1 failed) 412ms
   × 宽度 1280px › 浅色下不破版 391ms
     → Snapshot mismatch: home-1280-light.png (diff 0.02%)

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)`

// 失败后的 agent 文本:说明失败与本次改动无关,并引出推送前的确认。
export const TEXT_BEFORE_APPROVAL =
  '有 1 个用例失败,是既有的 snapshot 差异,与本次改动无关。需要我把改动推送到 main 吗?'

// 审批:危险操作执行前的阻塞点。
export const APPROVAL_COMMAND = 'Bash(git push origin main)'
export const APPROVAL_PROMPT = '推送本次改动到 main 分支'

// 批准后 push 的输出。
export const PUSH_RESULT = `To github.com:maixai/protodesigns.git
   a1b2c3d..d4e5f6a  main -> main`

export const TEXT_AFTER_APPROVE = '已推送到 main,本轮改动完成。'

export const TEXT_AFTER_DENY = '已取消推送,改动保留在本地工作区,需要时再告诉我。'

// 会话连接失败的提示文案。
export const CONNECT_ERROR_MESSAGE = '无法连接到 agent 服务,请检查本地守护进程是否在运行。'
