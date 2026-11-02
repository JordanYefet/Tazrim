import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { TOKEN_GROUPS, cssValue } from '../tokens'

const css = readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf8')
// The :root and .dark blocks of the two token layers (colour + depth)
const darkBlocks = [...css.matchAll(/\.dark\s*\{([^}]*)\}/g)].map(m => m[1]).join('\n')
const defined = (name: string, source: string) => new RegExp(`${name}\\s*:`).test(source)

describe('TOKEN_GROUPS', () => {
  const all = TOKEN_GROUPS.flatMap(g => g.tokens)

  it('has the groups the spec lists', () => {
    expect(TOKEN_GROUPS.map(g => g.id)).toEqual(['color', 'semantic', 'chart', 'surface', 'radius', 'motion'])
  })

  it('names each token once', () => {
    const names = all.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it.each(all.map(t => [t.name, t] as const))('%s is defined in globals.css', (_, token) => {
    expect(defined(token.name, css)).toBe(true)
  })

  it.each(all.filter(t => t.themed).map(t => [t.name] as const))('%s is redefined for dark mode', name => {
    expect(defined(name, darkBlocks)).toBe(true)
  })

  it('wraps HSL triplets in hsl() and uses raw values as they are', () => {
    expect(cssValue({ name: '--income', format: 'hsl', purpose: '', themed: true })).toBe('hsl(var(--income))')
    expect(cssValue({ name: '--chart-1', format: 'color', purpose: '', themed: true })).toBe('var(--chart-1)')
    expect(cssValue({ name: '--elevation-2', format: 'shadow', purpose: '', themed: true })).toBe('var(--elevation-2)')
  })
})
