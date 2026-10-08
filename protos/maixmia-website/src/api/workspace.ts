// 类型化内存 API：演示延迟与业务失败均遵循 Result 约定。
import type { ChatSession } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import { useI18n } from '../i18n'
import { delay } from '../mocks/delay'
import { mockCreateSession, mockSaveResponse, mockSendMessage, mockSessions, mockTranscript } from '../mocks/workspace'
import type { Result } from './result'

const { t } = useI18n()

export async function listSessions(): Promise<Result<ChatSession[]>> {
  await delay()
  return { ok: true, value: mockSessions() }
}

export async function getTranscript(sessionId: string): Promise<Result<ChatMessage[]>> {
  await delay()
  if (!mockSessions().some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockTranscript(sessionId) }
}

export async function sendMessage(sessionId: string, text: string): Promise<Result<ChatMessage>> {
  await delay()
  if (!text.trim()) return { ok: false, error: new Error(t.value.workspace.emptyMessage) }
  if (!mockSessions().some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockSendMessage(sessionId, text.trim()) }
}

export async function createSession(): Promise<Result<ChatSession>> {
  await delay()
  return { ok: true, value: mockCreateSession() }
}

export async function saveResponse(sessionId: string, response: ChatMessage): Promise<Result<ChatMessage>> {
  await delay()
  if (!mockSessions().some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  mockSaveResponse(sessionId, response)
  return { ok: true, value: response }
}
