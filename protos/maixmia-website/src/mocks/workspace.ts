// 演示结构与内存数据；展示文案从当前语言词条组装，刷新即重置。
import type { ChatSession } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Messages } from '../i18n'
import { useI18n } from '../i18n'

const { t } = useI18n()
const sessionSeeds = [
  { id: 'weekly', title: 'weekly', updatedAt: '2026-10-08T09:30:00Z' },
  { id: 'research', title: 'research', updatedAt: '2026-10-07T07:20:00Z' },
  { id: 'launch', title: 'launch', updatedAt: '2026-10-06T03:10:00Z' },
  { id: 'knowledge', title: 'knowledge', updatedAt: '2026-10-05T08:00:00Z' },
] satisfies (ChatSession & { title: keyof Messages['workspace']['sessions'] })[]

const messageSeeds = {
  weekly: [
    { id: 'weekly-1', role: 'user', body: 'weeklyUser1', createdAt: '2026-10-08T09:25:00Z' },
    { id: 'weekly-2', role: 'assistant', body: 'weeklyAssistant1', createdAt: '2026-10-08T09:26:00Z' },
    { id: 'weekly-3', role: 'user', body: 'weeklyUser2', createdAt: '2026-10-08T09:29:00Z' },
    { id: 'weekly-4', role: 'assistant', body: 'weeklyAssistant2', createdAt: '2026-10-08T09:30:00Z' },
  ],
  research: [
    { id: 'research-1', role: 'user', body: 'researchUser', createdAt: '2026-10-07T07:19:00Z' },
    { id: 'research-2', role: 'assistant', body: 'researchAssistant', createdAt: '2026-10-07T07:20:00Z' },
  ],
  launch: [
    { id: 'launch-1', role: 'user', body: 'launchUser', createdAt: '2026-10-06T03:09:00Z' },
    { id: 'launch-2', role: 'assistant', body: 'launchAssistant', createdAt: '2026-10-06T03:10:00Z' },
  ],
  knowledge: [
    { id: 'knowledge-1', role: 'user', body: 'knowledgeUser', createdAt: '2026-10-05T07:59:00Z' },
    { id: 'knowledge-2', role: 'assistant', body: 'knowledgeAssistant', createdAt: '2026-10-05T08:00:00Z' },
  ],
} satisfies Record<string, (ChatMessage & { body: keyof Messages['workspace']['messages'] })[]>

const responsePool: (keyof Messages['workspace']['responses'])[] = ['first', 'second', 'third']
const extraSessions: ChatSession[] = []
const extraMessages = new Map<string, ChatMessage[]>()
const translatedReplies = new Map<string, keyof Messages['workspace']['responses']>()
const responseBodies = new Map<string, string>()
const turns = new Map<string, number>()
const sequence = { session: 0, message: 0 }

export function mockSessions(): ChatSession[] {
  return [
    ...extraSessions.map((session) => ({ ...session, title: session.title || t.value.workspace.newChat })),
    ...sessionSeeds.map((session) => ({ ...session, title: t.value.workspace.sessions[session.title] })),
  ]
}

export function mockTranscript(sessionId: string): ChatMessage[] {
  const key = sessionSeeds.find((session) => session.id === sessionId)?.title
  const initial: ChatMessage[] = key ? messageSeeds[key].map((message) => ({ ...message, body: t.value.workspace.messages[message.body] })) : []
  const extra = (extraMessages.get(sessionId) ?? []).map((message) => {
    // 部分正文保持原文；完成及重新生成完成的应答按当前语言组装。
    const responseKey = message.body === responseBodies.get(message.id) ? translatedReplies.get(message.id) : undefined
    return { ...message, body: responseKey ? t.value.workspace.responses[responseKey] : message.body }
  })
  return [...initial, ...extra]
}

export function mockCreateSession(): ChatSession {
  sequence.session += 1
  const session: ChatSession = { id: `draft-${sequence.session}`, title: '', updatedAt: '2026-10-08T10:00:00Z' }
  extraSessions.unshift(session)
  extraMessages.set(session.id, [])
  return { ...session, title: t.value.workspace.newChat }
}

export function mockSendMessage(sessionId: string, text: string): ChatMessage {
  sequence.message += 1
  const turn = turns.get(sessionId) ?? 0
  turns.set(sessionId, turn + 1)
  const responseKey = responsePool[turn % responsePool.length] ?? 'first'
  const createdAt = new Date(Date.UTC(2026, 9, 8, 10, sequence.message)).toISOString()
  const user: ChatMessage = { id: `user-${sequence.message}`, role: 'user', body: text, createdAt }
  const response: ChatMessage = { id: `response-${sequence.message}`, role: 'assistant', body: t.value.workspace.responses[responseKey], createdAt }
  extraMessages.set(sessionId, [...(extraMessages.get(sessionId) ?? []), user, { ...response, body: '' }])
  translatedReplies.set(response.id, responseKey)
  responseBodies.set(response.id, response.body)
  const session = extraSessions.find((item) => item.id === sessionId)
  if (session) {
    session.title ||= text
    session.updatedAt = createdAt
  }
  return response
}

export function mockSaveResponse(sessionId: string, response: ChatMessage): void {
  const messages = extraMessages.get(sessionId) ?? []
  const existing = messages.find((message) => message.id === response.id)
  if (existing) existing.body = response.body
}
