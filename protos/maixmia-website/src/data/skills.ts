// Skill 的检索、草稿插入与展示派生;不持有第二份输入状态。
import type { Skill } from '../contracts/generated/skill'

function matchRank(skill: Skill, needle: string): number {
  const command = skill.command.toLowerCase()
  const name = skill.name.toLowerCase()
  if (command.startsWith(needle)) return 0
  if (command.includes(needle)) return 1
  if (name.startsWith(needle)) return 2
  if (name.includes(needle)) return 3
  if (skill.sourceName.toLowerCase().includes(needle)) return 4
  if (skill.description.toLowerCase().includes(needle)) return 5
  return 6
}

export function filterSkills(skills: readonly Skill[], query: string): Skill[] {
  const needle = query.trim().toLowerCase()
  return skills.filter((skill) => matchRank(skill, needle) < 6).sort((a, b) => (
    matchRank(a, needle) - matchRank(b, needle)
    || Number(b.scope === 'project') - Number(a.scope === 'project')
    || a.command.localeCompare(b.command)
  ))
}

export function insertSkillIntoDraft(draft: string, command: string): string {
  const prefix = `/${command} `
  if (draft.trim() === '') return prefix
  if (draft.startsWith('/')) return draft.replace(/^\/\S*\s*/, prefix)
  return prefix + draft
}

export function skillOptionId(listId: string, index: number): string {
  return `${listId}-option-${index}`
}

export function skillDescriptionWithSource(skill: Skill): string {
  return skill.scope === 'agentPlugin' ? `${skill.sourceName} · ${skill.description}` : skill.description
}
