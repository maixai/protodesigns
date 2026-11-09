import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('shared Storybook preview wiring', () => {
  it('mounts every requested interactive story before its bounded visible-control queries', () => {
    const files = ['agent-mcp.stories.ts', 'project-mcp-panel.stories.ts', 'project-plugins-panel.stories.ts']
    for (const file of files) {
      const source = readFileSync(join(root, 'src/components', file), 'utf8')
      expect(source, file).not.toContain('MutationObserver')
      const plays = source.match(/play:\s*async/g) ?? []
      const explicitMounts = source.match(/play:\s*async\s*\(\{\s*mount,/g) ?? []
      expect(explicitMounts.length, file).toBe(plays.length)
      expect(source, file).toContain('visibleStoryButton')
    }
  })
  it('routes every CSF factory through the preview configuration without replacing story states', () => {
    const files = readdirSync(join(root, 'src/components')).filter((name) => name.endsWith('.stories.ts'))
    const factories = files.flatMap((name) => {
      const source = readFileSync(join(root, 'src/components', name), 'utf8')
      return source.includes('meta.story(') ? [{ name, source }] : []
    })
    expect(factories.length).toBeGreaterThanOrEqual(8)
    for (const story of factories) {
      expect(story.source, story.name).toContain("import { preview } from '../../.storybook/preview'")
      expect(story.source, story.name).not.toContain('definePreview(')
      expect(story.source, story.name).toContain('preview.meta(')
    }
    const preview = readFileSync(join(root, '.storybook/preview.ts'), 'utf8')
    expect(preview).toContain('export const preview = definePreview(')
    expect(preview).toContain('darkOverrides')
    const setup = readFileSync(join(root, '.storybook/vitest.setup.ts'), 'utf8')
    expect(setup).toContain('beforeAll(preview.composed.beforeAll)')
  })
})
