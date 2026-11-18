import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { createRequire } from 'node:module'

const plugin = createRequire(import.meta.url)('../a11y-media.cjs')

async function run(css: string): Promise<string> {
  const out = await postcss([plugin()]).process(css, { from: undefined })
  return out.css.replace(/\s+/g, ' ').trim()
}

describe('a11y-media plugin', () => {
  it('copies a reduced-motion block under the class, right after it', async () => {
    const css = await run('@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }')
    expect(css).toBe(
      '@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } } ' +
        ':where(:root[data-a11y~="still"]) .sheet { animation: none; }'
    )
  })

  it('maps contrast and transparency to the contrast token', async () => {
    const a = await run('@media (prefers-contrast: more) { .x { color: red } }')
    const b = await run('@media (prefers-reduced-transparency:reduce) { .x { color: red } }')
    expect(a).toContain(':where(:root[data-a11y~="contrast"]) .x')
    expect(b).toContain(':where(:root[data-a11y~="contrast"]) .x')
  })

  it('puts the class on selectors that already target <html>', async () => {
    const css = await run(
      '@media (prefers-contrast: more) { :root, .dark { --a: 1 } html.dark[data-bg="lines"] { --b: 2 } .dark .foo { --c: 3 } html[data-privacy="on"] [data-money] { --d: 4 } [data-bg="grid"] body::before { --e: 5 } }'
    )
    expect(css).toContain(':root:where([data-a11y~="contrast"]), .dark:where([data-a11y~="contrast"]) { --a: 1 }')
    expect(css).toContain('html.dark[data-bg="lines"]:where([data-a11y~="contrast"]) { --b: 2 }')
    expect(css).toContain('.dark:where([data-a11y~="contrast"]) .foo { --c: 3 }')
    expect(css).toContain('html[data-privacy="on"]:where([data-a11y~="contrast"]) [data-money] { --d: 4 }')
    expect(css).toContain('[data-bg="grid"]:where([data-a11y~="contrast"]) body::before { --e: 5 }')
  })

  it('does not mistake an escaped utility class for the root', async () => {
    const css = await run('@media (prefers-reduced-motion: reduce) { .dark\\:motion-reduce\\:x { a: b } }')
    expect(css).toContain(':where(:root[data-a11y~="still"]) .dark\\:motion-reduce\\:x { a: b }')
  })

  it('keeps other conditions in a media wrapper', async () => {
    const css = await run('@media (max-width: 639.98px) and (prefers-reduced-motion: reduce) { .a { b: c } }')
    expect(css).toContain('@media (max-width: 639.98px) { :where(:root[data-a11y~="still"]) .a { b: c } }')
  })

  it('handles a comma list: each matching query, one copy per class', async () => {
    const css = await run('@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .a { b: c } }')
    expect(css.match(/:where\(:root\[data-a11y~="contrast"\]\) \.a/g)).toHaveLength(1)
    expect(css.endsWith(':where(:root[data-a11y~="contrast"]) .a { b: c }')).toBe(true)
  })

  it('leaves unrelated media alone', async () => {
    const src = '@media (min-width: 768px) { .a { b: c } }'
    expect(await run(src)).toBe(src)
  })

  it('scopes rules in nested at-rules and hoists keyframes unchanged', async () => {
    const css = await run(
      '@media (prefers-reduced-motion: reduce) { @supports (display: grid) { .a { b: c } } @keyframes k { from { a: b } to { a: c } } }'
    )
    expect(css).toContain('@supports (display: grid) { :where(:root[data-a11y~="still"]) .a { b: c } }')
    // hoisted, with its from/to untouched
    expect(css.match(/@keyframes k \{ from \{ a: b \} to \{ a: c \} \}/g)).toHaveLength(2)
  })

  it('puts the class before a pseudo-element on the root compound', async () => {
    const css = await run('@media (prefers-contrast: more) { html::after { a: b } }')
    expect(css).toContain('html:where([data-a11y~="contrast"])::after { a: b }')
  })
})
