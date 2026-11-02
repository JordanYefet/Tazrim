# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write down the design rules Tazrim already follows, as `docs/design-system.md` plus a dev-only `/design` page that shows every token and shared component live.

**Architecture:** A small token registry (`lib/design/tokens.ts`) lists the documented CSS custom properties by group. It is the one list that both the `/design` page renders and the tests check against `app/globals.css`, so the doc, the page and the CSS can't drift apart. The doc is hand-written prose that names tokens and component paths; a guard test checks that every name and path it mentions exists.

**Tech Stack:** Next.js 15 app router (server page + client demo components), Tailwind with CSS variables, Vitest (`npm test`, node environment, `renderToStaticMarkup` for pages), next-themes.

**Spec:** `docs/superpowers/specs/2026-11-02-design-system-design.md`

## Global Constraints

- **No visual changes.** No edits to `app/globals.css`, `tailwind.config.ts` or any existing component. Gaps are written down, not fixed.
- `/design` calls `notFound()` when `process.env.NODE_ENV === 'production'`, and it is not linked from `MAIN_NAV` or the bottom nav.
- Hebrew-first copy and RTL (`dir="rtl"`) on the page. Use logical Tailwind classes (`ms-`, `pe-`, `start-`, `end-`).
- Examples use made-up values only: no real names, amounts or account numbers.
- No coloured side stripes, accent bars or gradient washes on the `/design` page either. Swatches are plain squares.
- Work in the worktree `/Users/jordanyefetberman/Git/Personal/Tazrim-projection`, on a branch off `main`. Run `npm ci` there before anything that runs Prisma or Next, and never run `next build` inside the :3000 dev-server folder.
- Commits use the GitHub noreply email. The PR title starts with `feat:`.

## Review Focus

1. **Dark mode:** every swatch on `/design` must follow the theme (they read `hsl(var(--x))`, never a hard-coded value). Test: the rendered page contains `var(--background)` and no `#` hex values in the swatch markup.
2. **Tokens that are raw colours, not HSL triplets:** `--chart-*` hold hex and `--elevation-*` hold shadows. The swatch must render them correctly (`background: var(--chart-1)`, not `hsl(var(--chart-1))`). Test: the registry marks each token's `format` and the swatch test checks both forms.
3. **Production build:** `/design` must 404. Test: the page throws Next's not-found error with `NODE_ENV=production`.
4. **The doc going stale:** a token renamed in CSS must fail a test. Test: every `--token` in backticks in the doc exists in `globals.css`.
5. **Narrow phones:** the token grid must not scroll sideways at 360px. Manual check at phone width, plus the grid uses `grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/design/tokens.ts` (create) | Registry of documented tokens: group, name, format, purpose (Hebrew + English) |
| `lib/design/__tests__/tokens.test.ts` (create) | Every registry token is defined in `globals.css` (light and, where it changes, dark) |
| `docs/design-system.md` (create) | The written system: principles, tokens, components, patterns, do/don't, known gaps |
| `lib/design/__tests__/design-doc.test.ts` (create) | Guard: doc sections exist, every `--token` and every component path it names exists |
| `components/design/token-swatch.tsx` (create) | One token shown as a swatch, a type sample, a radius box, a shadow box or a motion bar |
| `components/design/component-gallery.tsx` (create, client) | Live instances of the shared components with made-up data |
| `app/design/page.tsx` (create) | The dev-only page: theme toggle, token groups, gallery |
| `app/design/__tests__/page.test.tsx` (create) | 404 in production; renders every group in development |

---

### Task 1: Token registry

**Files:**
- Create: `lib/design/tokens.ts`
- Test: `lib/design/__tests__/tokens.test.ts`

**Interfaces:**
- Produces:
  - `type TokenFormat = 'hsl' | 'color' | 'shadow' | 'duration' | 'easing' | 'length'`
  - `interface DesignToken { name: string; format: TokenFormat; purpose: string; themed: boolean }`. `name` includes the leading `--`. `themed` is true when `.dark` redefines the token.
  - `interface TokenGroup { id: string; title: string; tokens: DesignToken[] }`
  - `const TOKEN_GROUPS: TokenGroup[]`
  - `function cssValue(token: DesignToken): string`. Returns `hsl(var(--x))` for `hsl` and `var(--x)` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// lib/design/__tests__/tokens.test.ts
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/design/__tests__/tokens.test.ts`
Expected: FAIL, `Cannot find module '../tokens'`.

- [ ] **Step 3: Write the registry**

Purposes come from the comments in `app/globals.css` (motion lines 26–32, depth lines 107–117).

```ts
// lib/design/tokens.ts
/**
 * The documented design tokens (docs/design-system.md), grouped as the /design
 * page shows them. The values live in app/globals.css only; this lists names
 * and what each is for, and the tests check every name still exists there.
 */
export type TokenFormat = 'hsl' | 'color' | 'shadow' | 'duration' | 'easing' | 'length'

export interface DesignToken {
  /** With the leading `--` */
  name: string
  format: TokenFormat
  purpose: string
  /** .dark gives it its own value */
  themed: boolean
}

export interface TokenGroup {
  id: string
  title: string
  tokens: DesignToken[]
}

const hsl = (name: string, purpose: string): DesignToken => ({ name, format: 'hsl', purpose, themed: true })
const color = (name: string, purpose: string): DesignToken => ({ name, format: 'color', purpose, themed: true })

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'color',
    title: 'צבעי בסיס',
    tokens: [
      hsl('--background', 'רקע העמוד'),
      hsl('--foreground', 'טקסט ראשי'),
      hsl('--card', 'משטח כרטיס'),
      hsl('--primary', 'פעולה ראשית, קישור, מיקוד'),
      hsl('--secondary', 'כפתור משני'),
      hsl('--muted', 'רקע שקט: שדות, מסילות'),
      hsl('--muted-foreground', 'טקסט משני'),
      hsl('--accent', 'ריחוף ובחירה'),
      hsl('--destructive', 'פעולה הרסנית בלבד'),
      hsl('--border', 'קווי מתאר'),
      hsl('--ring', 'טבעת מיקוד'),
    ],
  },
  {
    id: 'semantic',
    title: 'משמעות',
    tokens: [
      hsl('--income', 'הכנסה'),
      hsl('--expense', 'הוצאה'),
      hsl('--cc', 'כרטיס אשראי'),
    ],
  },
  {
    id: 'chart',
    title: 'גרפים',
    tokens: [
      color('--chart-income', 'סדרת הכנסות'),
      color('--chart-expense', 'סדרת הוצאות'),
      color('--chart-cc', 'סדרת כרטיסים'),
      ...Array.from({ length: 10 }, (_, i) => color(`--chart-${i + 1}`, `קטגוריה ${i + 1}`)),
    ],
  },
  {
    id: 'surface',
    title: 'עומק ומשטחים',
    tokens: [
      { name: '--elevation-1', format: 'shadow', purpose: 'משטח: גרפים, רשימות, טבלאות (.surface)', themed: true },
      { name: '--elevation-2', format: 'shadow', purpose: 'מורם: נתונים מרכזיים (.surface-raised)', themed: true },
      { name: '--elevation-hero', format: 'shadow', purpose: 'הנתון הראשי בעמוד (.surface-hero)', themed: true },
      { name: '--elevation-3', format: 'shadow', purpose: 'שכבת על: תפריטים, חלונות (.surface-overlay)', themed: true },
      hsl('--surface-edge', 'קו המתאר של משטחים'),
    ],
  },
  {
    id: 'radius',
    title: 'פינות',
    tokens: [{ name: '--radius', format: 'length', purpose: 'rounded-lg; md ו-sm נגזרים ממנו', themed: false }],
  },
  {
    id: 'motion',
    title: 'תנועה',
    tokens: [
      { name: '--motion-quick', format: 'duration', purpose: 'משוב לחיצה, חלונות קטנים', themed: false },
      { name: '--motion-fast', format: 'duration', purpose: 'יציאות, ריחוף, דעיכות קטנות', themed: false },
      { name: '--motion-base', format: 'duration', purpose: 'שכבות נכנסות: חלונות, גיליונות', themed: false },
      { name: '--motion-page', format: 'duration', purpose: 'עמוד נכנס: מספרים, גרפים', themed: false },
      { name: '--ease-ui', format: 'easing', purpose: 'ברירת המחדל לכל מעבר', themed: false },
      { name: '--ease-spring', format: 'easing', purpose: 'קפיץ: כרטיסים', themed: false },
    ],
  },
]

/** The CSS value that paints the token: HSL triplets need hsl(), the rest are complete */
export function cssValue(token: DesignToken): string {
  return token.format === 'hsl' ? `hsl(var(${token.name}))` : `var(${token.name})`
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run lib/design/__tests__/tokens.test.ts`
Expected: PASS. If a `themed` assertion fails, the token isn't redefined in `.dark`. Set `themed: false` for that token and add it to the doc's Known gaps; don't edit the CSS.

- [ ] **Step 5: Commit**

```bash
git add lib/design
git commit -m "Design tokens: a registry of the documented CSS variables"
```

---

### Task 2: The design-system document and its guard test

**Files:**
- Create: `docs/design-system.md`
- Test: `lib/design/__tests__/design-doc.test.ts`

**Interfaces:**
- Consumes: `TOKEN_GROUPS` from Task 1.
- Produces: `docs/design-system.md` with these exact `##` headings: `Principles`, `Tokens`, `Components`, `Patterns`, `Do / Don't`, `Known gaps`.

- [ ] **Step 1: Write the failing guard test**

```ts
// lib/design/__tests__/design-doc.test.ts
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run lib/design/__tests__/design-doc.test.ts`
Expected: FAIL, `ENOENT ... docs/design-system.md`.

- [ ] **Step 3: Read the sources, then write the doc**

Read these before writing. Every statement in the doc must be traceable to one of them.
- `app/globals.css` — whole file, and especially the section comments at lines 26–32, 107–117 and 255, plus the sections "Account elements", "Account colours", "Glass" and "Bar glass".
- `tailwind.config.ts` — font, colours, motion, shadow and radius aliases.
- `lib/motion.ts` — the JS mirror of the motion tokens.
- `app/fonts.ts` — the self-hosted Heebo.
- Every file in `components/ui/` — the header comments explain what each component is for.
- `components/accounts/account-element.tsx` — `PaymentCard`, `BankElement`, `AccountMini`, `Sparkline`.
- `components/bank/balance-chart.tsx`, `components/cards/month-bars.tsx`, `lib/insights/month-bars.ts`, `lib/insights/chart-months.ts`.
- `app/settings/page.tsx` — the Settings list pattern.
- `components/accounts/edit-account-dialog.tsx` — create = edit window.

Write `docs/design-system.md` in English, quoting the UI's Hebrew labels where useful, with this structure:

```markdown
# Tazrim Design System

What Tazrim's interface already does, written down. Read it before adding UI.
Live tokens and components: run the dev server and open `/design`.

## Principles
- Hebrew-first, RTL: logical properties (`ms-`/`pe-`/`start-`), charts laid out LTR inside (globals.css explains why), numbers with `tabular-nums`.
- Calm: data first, one hero figure per page (`.surface-hero`), no decoration for its own sake.
- Stable layout: elements never change place when state changes. Dim (`DimmablePair`), reserve the space, or show a faint placeholder (`EmptyMonthSlots`) instead of collapsing or reflowing.
- No AI design tropes: no coloured side stripe, accent bar or gradient wash on cards, rows or headers. An account's identity colour lives on its face (card/bank element) only.
- Glass is baked: the liquid-glass lens is pre-rendered (`glassBaked`); never a live `backdrop-filter` on content.
- One clock: every duration and easing comes from the motion tokens.

## Tokens
One subsection per registry group (Colour, Semantic, Charts, Depth and surfaces, Radius, Motion), each a table: token (in backticks) · light · dark · use. Copy values from globals.css. For depth: the 0–3 scale and the `.surface*` classes; for type: Heebo via `font-sans`, the sizes actually used for page title / section title / body / caption (read them from `app/page.tsx` and `components/layout/*`).

## Components
One short entry per component: what it's for, when to use it, when not to, and its path in backticks. Cover `AppDialog`, `ConfirmDialog`/`useConfirm`, `SegmentedTrack`, `RollingNumber`/`DigitStrip`, `EmptyMonthSlots`, `DataSwap`, `DimmablePair`, `Reveal`, `ColumnPicker`, `PaymentCard`, `BankElement`, `AccountMini`, `Sparkline`, `BalanceChart`, `MonthBarsChart`.

## Patterns
Page header; hero figure with rolling digits; charts (January–December, months after the latest data as faint stubs, RTL axis handling); tables; centred pills; windows = `AppDialog`, the create window is the edit window; Settings list; empty states; account colour and glass.

## Do / Don't
A checklist of 10–15 lines to run before a UI PR.

## Known gaps
Anything inconsistent found while reading (hard-coded colours or durations, tokens that are defined but unused, tokens without a dark value). One line each with a suggested follow-up. Nothing here is fixed in this change.
```

- [ ] **Step 4: Run the guard test and see it pass**

Run: `npx vitest run lib/design/__tests__/design-doc.test.ts`
Expected: PASS. If a path or token is missing, fix the doc, not the test.

- [ ] **Step 5: Commit**

```bash
git add docs/design-system.md lib/design/__tests__/design-doc.test.ts
git commit -m "Design system: write down the tokens, components and rules"
```

---

### Task 3: The dev-only `/design` page

**Files:**
- Create: `components/design/token-swatch.tsx`
- Create: `components/design/component-gallery.tsx`
- Create: `app/design/page.tsx`
- Test: `app/design/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `TOKEN_GROUPS`, `cssValue`, `DesignToken` (Task 1). `ThemeSelector` from `components/layout/theme-selector.tsx` (check its export name before importing). `RollingNumber`, `SegmentedTrack`, `AppDialog`, `DimmablePair`, `Reveal` from `components/ui/*`. `PaymentCard`, `BankElement` from `components/accounts/account-element.tsx`.
- Produces: `export default function DesignPage()` and `export const metadata = { title: 'מערכת עיצוב · תזרים' }`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/design/__tests__/page.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TOKEN_GROUPS } from '@/lib/design/tokens'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
  usePathname: () => '/design',
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme: () => {}, resolvedTheme: 'light' }) }))

afterEach(() => vi.unstubAllEnvs())

async function render() {
  const { default: DesignPage } = await import('../page')
  return renderToStaticMarkup(<DesignPage />)
}

describe('/design', () => {
  it('is not found in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows every token group and token in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    for (const g of TOKEN_GROUPS) {
      expect(html).toContain(g.title)
      for (const t of g.tokens) expect(html).toContain(t.name)
    }
  })

  it('paints swatches from the tokens, never from fixed colours', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    expect(html).toContain('background:hsl(var(--background))')
    expect(html).toContain('background:var(--chart-1)')
    expect(html).toContain('box-shadow:var(--elevation-2)')
    const swatchStyles = [...html.matchAll(/data-token="[^"]+"[^>]*style="([^"]*)"/g)].map(m => m[1])
    expect(swatchStyles.length).toBeGreaterThan(30)
    expect(swatchStyles.filter(s => /#[0-9a-f]{3,6}/i.test(s))).toEqual([])
  })

  it('is right to left and names the tab', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const html = await render()
    expect(html).toContain('dir="rtl"')
    const { metadata } = await import('../page')
    expect(metadata.title).toBe('מערכת עיצוב · תזרים')
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run app/design/__tests__/page.test.tsx`
Expected: FAIL, `Cannot find module '../page'`.

- [ ] **Step 3: Write the swatch**

```tsx
// components/design/token-swatch.tsx
import type { CSSProperties } from 'react'
import { cssValue, type DesignToken } from '@/lib/design/tokens'

/** One token, drawn the way it's used: a colour, a shadow, a radius or a motion */
export function TokenSwatch({ token }: { token: DesignToken }) {
  const value = cssValue(token)
  const style: CSSProperties =
    token.format === 'shadow' ? { boxShadow: value }
    : token.format === 'length' ? { borderRadius: value }
    : token.format === 'duration' ? { transitionDuration: value }
    : token.format === 'easing' ? { transitionTimingFunction: value }
    : { background: value }
  const box =
    token.format === 'hsl' || token.format === 'color'
      ? 'h-14 rounded-lg border border-border'
      : token.format === 'duration' || token.format === 'easing'
        ? 'h-14 rounded-lg bg-muted transition-transform group-hover:translate-x-2'
        : 'h-14 rounded-lg bg-card border border-border'
  return (
    <figure className="group min-w-0">
      <div data-token={token.name} className={box} style={style} />
      <figcaption className="mt-2 space-y-0.5">
        <code dir="ltr" className="block truncate text-xs font-medium">{token.name}</code>
        <span className="block text-xs text-muted-foreground">{token.purpose}</span>
      </figcaption>
    </figure>
  )
}
```

- [ ] **Step 4: Write the gallery (client component, made-up data)**

```tsx
// components/design/component-gallery.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { DimmablePair } from '@/components/ui/dimmable-pair'
import { Reveal } from '@/components/ui/reveal'
import { RollingNumber } from '@/components/ui/rolling-number'
import { SegmentedTrack } from '@/components/ui/segmented'
import { BankElement, PaymentCard } from '@/components/accounts/account-element'

function Item({ name, path, children }: { name: string; path: string; children: ReactNode }) {
  return (
    <section className="surface rounded-2xl p-5 space-y-4">
      <header>
        <h3 className="font-semibold">{name}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">{path}</code>
      </header>
      {children}
    </section>
  )
}

const SEGMENTS = [
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
]

export function ComponentGallery() {
  const [amount, setAmount] = useState(12_480)
  const [segment, setSegment] = useState('month')
  const [dim, setDim] = useState<'first' | 'second' | undefined>('second')
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  const button = 'rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Item name="RollingNumber" path="components/ui/rolling-number.tsx">
        <div className="text-3xl font-semibold tabular-nums"><RollingNumber value={amount} /></div>
        <button className={button} onClick={() => setAmount(a => a + 1_234)}>הוסף ₪1,234</button>
      </Item>

      <Item name="SegmentedTrack" path="components/ui/segmented.tsx">
        <SegmentedTrack
          role="radiogroup"
          active={segment}
          thumbClassName="rounded-md bg-card shadow-e1"
          className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-0.5"
        >
          {SEGMENTS.map(s => (
            <button
              key={s.key}
              role="radio"
              aria-checked={segment === s.key}
              data-segment={s.key}
              data-on={segment === s.key || undefined}
              onClick={() => setSegment(s.key)}
              className="relative rounded-md px-3 py-1 text-sm"
            >
              {s.label}
            </button>
          ))}
        </SegmentedTrack>
      </Item>

      <Item name="DimmablePair" path="components/ui/dimmable-pair.tsx">
        <DimmablePair
          dim={dim}
          first={<div className="surface rounded-xl p-4">הכנסות</div>}
          second={<div className="surface rounded-xl p-4">הוצאות</div>}
        />
        <button className={button} onClick={() => setDim(d => (d === 'second' ? 'first' : 'second'))}>החלף</button>
      </Item>

      <Item name="Reveal" path="components/ui/reveal.tsx">
        <button className={button} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="reveal-demo">
          {open ? 'סגור' : 'פתח'}
        </button>
        <Reveal open={open} id="reveal-demo" className="pt-3">
          <p className="text-sm text-muted-foreground">תוכן שנפתח במקום, בלי שהעמוד יקפוץ.</p>
        </Reveal>
      </Item>

      <Item name="AppDialog" path="components/ui/app-dialog.tsx">
        <button className={button} onClick={() => setDialog(true)}>פתח חלון</button>
        <AppDialog open={dialog} onOpenChange={setDialog} title="חלון לדוגמה">
          <p className="mt-3 text-sm text-muted-foreground">כל חלון באפליקציה נבנה על החלון הזה.</p>
        </AppDialog>
      </Item>

      <Item name="PaymentCard" path="components/accounts/account-element.tsx">
        <div className="max-w-xs">
          <PaymentCard provider="max" name="כרטיס לדוגמה" lastFour="1234" network="mastercard" />
        </div>
      </Item>

      <Item name="BankElement" path="components/accounts/account-element.tsx">
        <div className="max-w-sm">
          <BankElement
            provider="leumi"
            name="חשבון לדוגמה"
            latest={{ balance: 8_200, date: '2030-03-31' }}
            totals={{ income: 15_000, expense: 11_300 }}
            trend={[6_100, 7_400, 6_900, 8_200]}
          />
        </div>
      </Item>
    </div>
  )
}
```

Before running, open `components/accounts/account-element.tsx` and check that `provider` accepts `'max'` and `'leumi'` and that `network` accepts `'mastercard'`. Use whatever the existing demo seed uses (`grep -rn "provider:" prisma/seed* lib/demo* 2>/dev/null`).

- [ ] **Step 5: Write the page**

```tsx
// app/design/page.tsx
import { notFound } from 'next/navigation'
import { TOKEN_GROUPS } from '@/lib/design/tokens'
import { TokenSwatch } from '@/components/design/token-swatch'
import { ComponentGallery } from '@/components/design/component-gallery'
import { ThemeSelector } from '@/components/layout/theme-selector'

export const metadata = { title: 'מערכת עיצוב · תזרים' }

/** The design system, live (docs/design-system.md). Development only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <div dir="rtl" className="space-y-10 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">מערכת עיצוב</h1>
          <p className="text-sm text-muted-foreground">
            הטוקנים והרכיבים המשותפים, חיים. התיעוד: <code dir="ltr">docs/design-system.md</code>
          </p>
        </div>
        <ThemeSelector />
      </header>

      {TOKEN_GROUPS.map(group => (
        <section key={group.id} aria-labelledby={`tokens-${group.id}`} className="space-y-4">
          <h2 id={`tokens-${group.id}`} className="text-lg font-semibold">{group.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4">
            {group.tokens.map(token => <TokenSwatch key={token.name} token={token} />)}
          </div>
        </section>
      ))}

      <section aria-labelledby="type" className="space-y-3">
        <h2 id="type" className="text-lg font-semibold">טיפוגרפיה</h2>
        <p className="text-2xl font-bold">כותרת עמוד · ₪12,480</p>
        <p className="text-lg font-semibold">כותרת אזור</p>
        <p className="text-sm">טקסט רגיל, עם מספרים <span className="tabular-nums">1,234.56</span></p>
        <p className="text-xs text-muted-foreground">טקסט משני וכיתובים</p>
      </section>

      <section aria-labelledby="components" className="space-y-4">
        <h2 id="components" className="text-lg font-semibold">רכיבים</h2>
        <ComponentGallery />
      </section>
    </div>
  )
}
```

Replace the type-scale classes with the ones the doc's Tokens → Type section records (Task 2), so the page and the doc agree.

- [ ] **Step 6: Run the page test and see it pass**

Run: `npx vitest run app/design/__tests__/page.test.tsx`
Expected: PASS. If `ThemeSelector` or an account element pulls in something the node environment can't render, add a matching `vi.mock` in the test, following the existing component tests in `components/*/__tests__`. Don't change the component.

- [ ] **Step 7: Check it in the browser**

In the worktree, start the dev server on a free port (`npx next dev -p 3001`; :3000 is main's preview) and open `http://localhost:3001/design`. Check that:
- it works in light and dark, with the theme selector switching every swatch;
- at 360px wide there is no sideways scroll;
- the dialog opens from the tap and the segmented thumb slides;
- RTL reads correctly.

- [ ] **Step 8: Commit**

```bash
git add app/design components/design
git commit -m "A dev-only /design page with the tokens and shared components"
```

---

### Task 4: Full check and PR

- [ ] **Step 1:** `npm test` — the whole suite passes.
- [ ] **Step 2:** `npx tsc --noEmit` and `npm run lint` are clean.
- [ ] **Step 3:** Production 404. In the worktree (not the :3000 folder), run `npx next build && npx next start -p 3002`. Check that `curl -s -o /dev/null -w '%{http_code}' localhost:3002/design` prints `404`, then stop the server.
- [ ] **Step 4:** Scan the diff for real data with `git diff origin/main --stat` and a read through `docs/design-system.md` and the gallery: only made-up names and amounts.
- [ ] **Step 5:** Check that every commit uses the noreply email: `git log origin/main.. --format='%ae' | sort -u`.
- [ ] **Step 6:** Push and open the PR titled `feat: design system — documented tokens, components and a dev-only /design page`. The body links ENG-86 and the spec. Close ENG-86 once it merges.
