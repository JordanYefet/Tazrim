import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { TOKEN_GROUPS } from '../tokens'

const root = path.resolve(__dirname, '../../..')
const doc = readFileSync(path.join(root, 'docs/design-system.md'), 'utf8')
const css = readFileSync(path.join(root, 'app/globals.css'), 'utf8')

describe('docs/design-system.md', () => {
  it('has every section', () => {
    for (const h of ['Principles', 'Tokens', 'Components', 'Patterns', "Do / Don't", 'Known gaps']) {
      expect(doc).toContain(`\n## ${h}\n`)
    }
  })

  it('only names tokens that exist in globals.css', () => {
    const named = [...doc.matchAll(/`(--[a-z0-9-]+)`/g)].map(m => m[1])
    expect(named.length).toBeGreaterThan(20)
    const missing = named.filter(n => !new RegExp(`${n}\\s*:`).test(css))
    expect(missing).toEqual([])
  })

  it('documents every token in the registry', () => {
    const missing = TOKEN_GROUPS.flatMap(g => g.tokens).filter(t => !doc.includes(`\`${t.name}\``))
    expect(missing.map(t => t.name)).toEqual([])
  })

  it('only points at files that exist', () => {
    const paths = [...doc.matchAll(/`((?:components|app|lib|hooks)\/[\w./[\]-]+\.(?:tsx?|css))`/g)].map(m => m[1])
    expect(paths.length).toBeGreaterThan(8)
    expect(paths.filter(p => !existsSync(path.join(root, p)))).toEqual([])
  })

  it('states the standing rules', () => {
    for (const rule of ['backdrop-filter', 'side stripe', 'Stable layout', 'AppDialog']) expect(doc).toContain(rule)
  })
})
