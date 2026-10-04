// agent 领域类型:定义已迁到 contracts/main.tsp,类型由 `make contracts` 生成;
// 此处只做转发,让组件 / 模拟层沿用稳定的引用路径,不再手写结构。
export type { SessionMeta } from '../contracts/generated/session-meta'
export type { SessionState, SessionStatus } from '../contracts/generated/session-state'
export type {
  ApprovalDecision,
  ApprovalEntry,
  AssistantEntry,
  DiffBlock,
  DiffLine,
  DiffLineKind,
  ThinkingEntry,
  ThinkingStep,
  ToolEntry,
  ToolName,
  ToolStatus,
  TranscriptEntry,
  UserEntry,
} from '../contracts/generated/transcript-entry'
