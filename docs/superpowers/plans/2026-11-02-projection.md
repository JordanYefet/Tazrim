# Projection (תחזית) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a תחזית page that forecasts the combined bank balance for the next 12 months, shows a range band, and flags months whose low edge falls below a cushion the user sets in Settings.

**Architecture:** A pure forecast engine (`lib/insights/projection.ts`) takes plain rows and recurring series and returns the months. A DB layer (`lib/db/projection.ts`) gathers those inputs for all banks or one bank. A key/value `Setting` table stores the cushion. The server page renders a headline, a Recharts chart (actual line → dashed forecast + band), a monthly table and the list of what went into the forecast.

**Tech Stack:** Next.js 15 app router, Prisma + SQLite, Recharts 2.15, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-projection-design.md`
**Design rules:** `docs/design-system.md`. Read its Principles, Patterns and Do / Don't before any UI task.

## Global Constraints

- Horizon: 12 months after the current month. Averaging window: the last **6** complete months before the latest data month. Fewer than **3** months with bank data → `{ insufficient: true }`.
- Everyday flows use the **median** per category. The band is `expected ± σ·√k` (k = months ahead, 1-based), with σ the population standard deviation of the window's monthly non-recurring net.
- Tight = `low < cushion`. The cushion is stored under the setting key `projection.cushion`, defaults to `0`, and is a non-negative number.
- No double counting (ENG-3): card spending enters only through the card-payment line. The detected card-payment bank series is never projected on top.
- Instalments are assumed to continue through the whole horizon. Reading "payment X of N" is a follow-up.
- Copy is Hebrew and the layout is RTL. Use logical classes (`ms-`/`pe-`/`start-`/`end-`). Charts lay out LTR inside (see `docs/design-system.md`).
- Stable layout: the tight-month line under the headline always reserves its space. Table rows keep the same columns in every state.
- No coloured side stripes, accent bars or gradient washes. The band is a soft area fill of `var(--chart-1)` at low opacity, which is a data mark, not decoration.
- Tests and docs use only made-up values. Test dates are in 2030.
- Work in a worktree off `main` (this branch builds on `feat/design-system`). Run `npm ci` there. Never run `next build` in the :3000 dev-server folder.
- Commits use the GitHub noreply email, and the PR title starts with `feat:`.
- **Mockups are approved by the owner before Task 5's UI code is written** (Task 4 is the gate).

## Review Focus

1. **A bank with card payments but no card files imported.** The card spending must still be forecast. The card line comes from the bank's own card-payment debits, so it works without card data. *Test in Task 1: no card rows, bank card-payment debits of 2,000 a month → 2,000 a month of card spending.*
2. **Stale data** (last upload two months ago). The months between must be projected and marked `stale`, and the horizon must still reach 12 months past today. *Test in Task 2.*
3. **A dismissed series.** Its rows count as everyday spending and it is not projected. An inactive (ended) series is neither projected nor counted as everyday. *Test in Task 1.*
4. **One bank selected.** Only that bank's rows, its paid cards (`payerAccountId`) and their series count. *Test in Task 3.*
5. **A cushion typed as text, negative, or empty.** The API rejects it with a Hebrew 400 and the stored value is kept. A garbage stored value reads back as 0. *Test in Task 3.*

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/insights/projection.ts` (create) | Pure engine: month helpers, everyday flows, recurring occurrences, `projectBalance` |
| `lib/insights/__tests__/projection.test.ts` (create) | Engine tests |
| `prisma/schema.prisma` (modify) + `prisma/migrations/20261102120000_settings/migration.sql` (create) | `Setting` table |
| `lib/db/settings.ts` (create) | `getCushion` / `setCushion` |
| `app/api/settings/route.ts` (create) | GET / PUT the cushion |
| `components/settings/cushion-setting.tsx` (create) + `app/settings/page.tsx` (modify) | The cushion field in Settings |
| `lib/db/projection.ts` (create) + `lib/db/__tests__/projection.test.ts` (create) | Gathers inputs for all banks or one bank and calls the engine |
| `components/projection/*` (create) | Headline, chart, table, items, account picker |
| `app/projection/page.tsx` (create) + `app/projection/__tests__/page.test.tsx` (create) | The page |
| `components/layout/nav-context.tsx`, `components/layout/bottom-nav.tsx` (modify) | Nav entries |

---

### Task 1: Engine building blocks — months, everyday flows, recurring occurrences

**Files:**
- Create: `lib/insights/projection.ts`
- Test: `lib/insights/__tests__/projection.test.ts`

**Interfaces:**
- Consumes: `addCycles`, `cadenceSpec`, `toDay`, `fmt`, `median`, `type Cadence` from `lib/insights/recurring.ts`.
- Produces (exported, used by Task 2 and Task 3):
  - `HORIZON_MONTHS = 12`, `WINDOW_MONTHS = 6`, `MIN_MONTHS = 3`
  - `monthKey(date: string): string` turns `'2030-03-15'` into `'2030-03'`.
  - `addMonths(month: string, n: number): string`
  - `interface BankFlowRow { id: string; date: string; debit: number; credit: number; category: string | null; isCardPayment: boolean }`
  - `interface CardChargeRow { id: string; billingDate: string; amount: number }`
  - `interface ProjectionSeries { key: string; name: string; source: 'bank' | 'card'; cadence: Cadence; latestAmount: number; monthlyAmount: number; nextDate: string; active: boolean; dismissed: boolean; isCardPayment: boolean; isInstallment: boolean; transactionIds: string[] }`
  - `interface Everyday { months: string[]; income: Record<string, number>; expense: Record<string, number>; card: number; sigma: number }`. `income` and `expense` map category → monthly median; `card` is the monthly non-recurring card spending; `months` are the window months that have bank data.
  - `everydayFlows(bank: BankFlowRow[], cards: CardChargeRow[], series: ProjectionSeries[], window: string[]): Everyday`
  - `projectedSeries(series: ProjectionSeries[]): ProjectionSeries[]` keeps series that are active, not dismissed and not card payments.
  - `occurrences(s: ProjectionSeries, from: string, to: string): string[]` returns the months (`YYYY-MM`, from…to inclusive) in which the series hits the bank, one entry per hit.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/insights/__tests__/projection.test.ts
import { describe, expect, it } from 'vitest'
import {
  addMonths,
  everydayFlows,
  monthKey,
  occurrences,
  projectedSeries,
  type BankFlowRow,
  type CardChargeRow,
  type ProjectionSeries,
} from '../projection'

// Made-up rows only
const WINDOW = ['2030-01', '2030-02', '2030-03', '2030-04', '2030-05', '2030-06']
let n = 0
const bank = (date: string, over: Partial<BankFlowRow> = {}): BankFlowRow => ({
  id: `b${++n}`, date, debit: 0, credit: 0, category: null, isCardPayment: false, ...over,
})
const card = (billingDate: string, amount: number, id = `c${++n}`): CardChargeRow => ({ id, billingDate, amount })
const series = (over: Partial<ProjectionSeries> = {}): ProjectionSeries => ({
  key: `s${++n}`, name: 'Series', source: 'bank', cadence: 'monthly', latestAmount: 100, monthlyAmount: 100,
  nextDate: '2030-07-15', active: true, dismissed: false, isCardPayment: false, isInstallment: false,
  transactionIds: [], ...over,
})
const each = <T,>(f: (m: string) => T) => WINDOW.map(m => f(m))

describe('month helpers', () => {
  it('keys and steps months across years', () => {
    expect(monthKey('2030-03-15')).toBe('2030-03')
    expect(addMonths('2030-11', 3)).toBe('2031-02')
    expect(addMonths('2030-01', -1)).toBe('2029-12')
  })
})

describe('everydayFlows', () => {
  it('takes the per-category median, so one big month does not move it', () => {
    const rows = each(m => bank(`${m}-05`, { debit: m === '2030-03' ? 20000 : 3000, category: 'סופר' }))
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.expense).toEqual({ סופר: 3000 })
  })

  it('splits income from spending', () => {
    const rows = [
      ...each(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
      ...each(m => bank(`${m}-09`, { debit: 4000, category: 'שכירות' })),
    ]
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.income).toEqual({ משכורת: 10000 })
    expect(e.expense).toEqual({ שכירות: 4000 })
    expect(e.sigma).toBe(0)
  })

  it('forecasts card spending from the bank card payments, even with no card files', () => {
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const e = everydayFlows(rows, [], [], WINDOW)
    expect(e.card).toBe(2000)
    expect(e.expense).toEqual({})
  })

  it('takes recurring card charges out of the card payment, so they are not counted twice', () => {
    const subIds = WINDOW.map(() => `sub${++n}`)
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const charges = WINDOW.map((m, i) => card(`${m}-02`, 100, subIds[i]))
    const sub = series({ source: 'card', transactionIds: subIds })
    expect(everydayFlows(rows, charges, [sub], WINDOW).card).toBe(1900)
  })

  it('leaves out rows of kept series, but counts rows of dismissed ones as everyday', () => {
    const kept = each(m => bank(`${m}-20`, { debit: 250, category: 'חשמל' }))
    const dismissed = each(m => bank(`${m}-21`, { debit: 80, category: 'קפה' }))
    const e = everydayFlows(
      [...kept, ...dismissed],
      [],
      [series({ transactionIds: kept.map(r => r.id) }), series({ dismissed: true, transactionIds: dismissed.map(r => r.id) })],
      WINDOW
    )
    expect(e.expense).toEqual({ קפה: 80 })
  })

  it('never treats a card-payment row as an ordinary recurring row', () => {
    const rows = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const cardPaymentSeries = series({ isCardPayment: true, transactionIds: rows.map(r => r.id) })
    expect(everydayFlows(rows, [], [cardPaymentSeries], WINDOW).card).toBe(2000)
  })

  it('measures how much the everyday net moves from month to month', () => {
    const rows = each(m => bank(`${m}-05`, { debit: m <= '2030-03' ? 1000 : 3000, category: 'סופר' }))
    // nets: -1000 ×3, -3000 ×3 → mean -2000, population σ 1000
    expect(everydayFlows(rows, [], [], WINDOW).sigma).toBe(1000)
  })

  it('names uncategorised rows', () => {
    const rows = each(m => bank(`${m}-05`, { debit: 50 }))
    expect(everydayFlows(rows, [], [], WINDOW).expense).toEqual({ 'ללא קטגוריה': 50 })
  })
})

describe('projectedSeries', () => {
  it('keeps active, kept, non-card-payment series only', () => {
    const keep = series()
    const out = projectedSeries([keep, series({ active: false }), series({ dismissed: true }), series({ isCardPayment: true })])
    expect(out).toEqual([keep])
  })
})

describe('occurrences', () => {
  it('lands a yearly item only in its own month', () => {
    expect(occurrences(series({ cadence: 'yearly', nextDate: '2030-09-15' }), '2030-07', '2031-07')).toEqual(['2030-09'])
  })

  it('repeats a monthly item every month of the range', () => {
    expect(occurrences(series({ nextDate: '2030-07-31' }), '2030-07', '2030-10')).toEqual(['2030-07', '2030-08', '2030-09', '2030-10'])
  })

  it('skips hits before the range', () => {
    expect(occurrences(series({ nextDate: '2030-05-03' }), '2030-07', '2030-08')).toEqual(['2030-07', '2030-08'])
  })

  it('moves a card subscription to the bank month after its charge, but not an instalment', () => {
    const sub = series({ source: 'card', cadence: 'yearly', nextDate: '2030-09-20' })
    expect(occurrences(sub, '2030-07', '2031-06')).toEqual(['2030-10'])
    const plan = series({ source: 'card', isInstallment: true, nextDate: '2030-09-02' })
    expect(occurrences(plan, '2030-09', '2030-10')).toEqual(['2030-09', '2030-10'])
  })

  it('counts every hit of a weekly item in its month', () => {
    const weekly = series({ cadence: 'weekly', nextDate: '2030-07-01' })
    expect(occurrences(weekly, '2030-07', '2030-07')).toEqual(['2030-07', '2030-07', '2030-07', '2030-07', '2030-07'])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run lib/insights/__tests__/projection.test.ts`
Expected: FAIL, `Cannot find module '../projection'`.

- [ ] **Step 3: Write the building blocks**

```ts
// lib/insights/projection.ts
/**
 * The balance forecast (ENG-87, docs/superpowers/specs/2026-11-02-projection-design.md).
 * Pure: the DB layer (lib/db/projection.ts) hands in plain rows.
 *
 * Each future month = recurring items on their own dates + everyday flows (the
 * median per category of the last complete months) + the card payment. Card
 * spending enters once, through the bank's card-payment debits less the card's
 * recurring charges, which are then placed on their own months (ENG-3: the bank
 * payment already holds the card charges, so they are never added twice).
 */
import { addCycles, cadenceSpec, fmt, median, toDay, type Cadence } from './recurring'
import { UNCATEGORIZED } from './bank-categories'

export const HORIZON_MONTHS = 12
export const WINDOW_MONTHS = 6
export const MIN_MONTHS = 3

export interface BankFlowRow {
  id: string
  /** YYYY-MM-DD */
  date: string
  debit: number
  credit: number
  category: string | null
  /** the bank's payment to a card company */
  isCardPayment: boolean
}

export interface CardChargeRow {
  id: string
  /** YYYY-MM-DD: the day the bank pays the card (ENG-46) */
  billingDate: string
  amount: number
}

export interface ProjectionSeries {
  key: string
  name: string
  source: 'bank' | 'card'
  cadence: Cadence
  latestAmount: number
  monthlyAmount: number
  /** YYYY-MM-DD */
  nextDate: string
  active: boolean
  dismissed: boolean
  isCardPayment: boolean
  isInstallment: boolean
  transactionIds: string[]
}

export interface Everyday {
  /** window months that have bank data */
  months: string[]
  /** category → monthly median */
  income: Record<string, number>
  expense: Record<string, number>
  /** monthly card spending that isn't a recurring card charge */
  card: number
  /** population standard deviation of the monthly everyday net */
  sigma: number
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function monthKey(date: string): string {
  return date.slice(0, 7)
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function add(map: Map<string, Map<string, number>>, category: string, month: string, amount: number) {
  const byMonth = map.get(category) ?? new Map<string, number>()
  byMonth.set(month, (byMonth.get(month) ?? 0) + amount)
  map.set(category, byMonth)
}

function medians(map: Map<string, Map<string, number>>, months: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [category, byMonth] of map) {
    const m = median(months.map(month => byMonth.get(month) ?? 0))
    if (m > 0) out[category] = m
  }
  return out
}

function populationSd(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return round2(Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length))
}

/** The everyday (non-recurring) flows of the window months that have bank data */
export function everydayFlows(
  bank: BankFlowRow[],
  cards: CardChargeRow[],
  series: ProjectionSeries[],
  window: string[]
): Everyday {
  const kept = series.filter(s => !s.dismissed)
  const recurringIds = new Set(kept.filter(s => !s.isCardPayment).flatMap(s => s.transactionIds))
  const inWindow = new Set(window)
  const months = window.filter(m => bank.some(r => monthKey(r.date) === m))

  const income = new Map<string, Map<string, number>>()
  const expense = new Map<string, Map<string, number>>()
  const cardPaid = new Map<string, number>()
  const cardRecurring = new Map<string, number>()

  for (const r of bank) {
    const month = monthKey(r.date)
    if (!inWindow.has(month)) continue
    // Card payments first: their own series is a card-payment series, never "recurring" here
    if (r.isCardPayment) {
      cardPaid.set(month, (cardPaid.get(month) ?? 0) + r.debit)
      continue
    }
    if (recurringIds.has(r.id)) continue
    const category = r.category ?? UNCATEGORIZED
    if (r.debit > 0) add(expense, category, month, r.debit)
    if (r.credit > 0) add(income, category, month, r.credit)
  }
  for (const c of cards) {
    const month = monthKey(c.billingDate)
    if (inWindow.has(month) && recurringIds.has(c.id)) cardRecurring.set(month, (cardRecurring.get(month) ?? 0) + c.amount)
  }

  const cardEveryday = (m: string) => Math.max(0, (cardPaid.get(m) ?? 0) - (cardRecurring.get(m) ?? 0))
  const sum = (map: Map<string, Map<string, number>>, m: string) =>
    [...map.values()].reduce((a, byMonth) => a + (byMonth.get(m) ?? 0), 0)
  const nets = months.map(m => sum(income, m) - sum(expense, m) - cardEveryday(m))

  return {
    months,
    income: medians(income, months),
    expense: medians(expense, months),
    card: months.length ? median(months.map(cardEveryday)) : 0,
    sigma: populationSd(nets),
  }
}

/** The series the forecast places on their own dates */
export function projectedSeries(series: ProjectionSeries[]): ProjectionSeries[] {
  return series.filter(s => s.active && !s.dismissed && !s.isCardPayment)
}

/**
 * The bank months (from…to, inclusive) a series hits, one entry per hit. A card
 * subscription is charged on the card and paid by the bank the month after; an
 * instalment is already dated by its billing month (fromCardRow).
 */
export function occurrences(s: ProjectionSeries, from: string, to: string): string[] {
  const spec = cadenceSpec(s.cadence)
  const shift = s.source === 'card' && !s.isInstallment ? 1 : 0
  const first = toDay(s.nextDate)
  const out: string[] = []
  for (let i = 0; ; i++) {
    const month = addMonths(monthKey(fmt(addCycles(first, spec, i))), shift)
    if (month > to) break
    if (month >= from) out.push(month)
  }
  return out
}
```

Check that `UNCATEGORIZED` is exported from `lib/insights/bank-categories.ts` (it is: `'ללא קטגוריה'`).

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run lib/insights/__tests__/projection.test.ts`
Expected: PASS. In the weekly test, 2030-07-01 is a Monday and July 2030 has five Mondays (1, 8, 15, 22, 29), so it expects 5 entries.

- [ ] **Step 5: Commit**

```bash
git add lib/insights/projection.ts lib/insights/__tests__/projection.test.ts
git commit -m "Projection engine: everyday flows and recurring occurrences"
```

---

### Task 2: `projectBalance` — months, band, tight, items

**Files:**
- Modify: `lib/insights/projection.ts` (append)
- Test: `lib/insights/__tests__/projection.test.ts` (append)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces (used by Tasks 3 and 5):
  - `interface ProjectionInput { today: string; cushion: number; start: { balance: number; date: string } | null; bank: BankFlowRow[]; cards: CardChargeRow[]; series: ProjectionSeries[]; past: { month: string; balance: number }[] }`
  - `interface ProjectedMonth { month: string; income: number; expense: number; net: number; expected: number; low: number; high: number; stale: boolean; tight: boolean }`
  - `interface ProjectionItem { key: string; name: string; kind: 'recurring' | 'everyday' | 'card'; direction: 'in' | 'out'; cadence: Cadence | null; monthlyAmount: number; seriesKey: string | null }`
  - `type Projection = { insufficient: true; completeMonths: number } | { insufficient: false; start: { balance: number; date: string }; end: ProjectedMonth; months: ProjectedMonth[]; tight: ProjectedMonth[]; items: ProjectionItem[]; past: { month: string; balance: number }[]; cushion: number; sigma: number }`
  - `projectBalance(input: ProjectionInput): Projection`

- [ ] **Step 1: Write the failing tests** (append to the test file)

```ts
import { projectBalance, type ProjectionInput } from '../projection'

const salaryAndRent = () => [
  ...each(m => bank(`${m}-01`, { credit: 10000, category: 'משכורת' })),
  ...each(m => bank(`${m}-09`, { debit: 6000, category: 'שכירות' })),
]
const input = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  today: '2030-07-05',
  cushion: 0,
  start: { balance: 5000, date: '2030-07-03' },
  bank: salaryAndRent(),
  cards: [],
  series: [],
  past: [],
  ...over,
})
const ok = (p: ReturnType<typeof projectBalance>) => {
  if (p.insufficient) throw new Error('expected a projection')
  return p
}

describe('projectBalance', () => {
  it('needs a starting balance', () => {
    expect(projectBalance(input({ start: null }))).toEqual({ insufficient: true, completeMonths: 0 })
  })

  it('needs 3 months of history', () => {
    const rows = ['2030-05', '2030-06'].map(m => bank(`${m}-01`, { credit: 100 }))
    expect(projectBalance(input({ bank: rows }))).toEqual({ insufficient: true, completeMonths: 2 })
  })

  it('projects the 12 months after the current one, adding each month’s net', () => {
    const p = ok(projectBalance(input()))
    expect(p.months.map(m => m.month)).toEqual([
      '2030-08', '2030-09', '2030-10', '2030-11', '2030-12', '2031-01',
      '2031-02', '2031-03', '2031-04', '2031-05', '2031-06', '2031-07',
    ])
    expect(p.months[0]).toMatchObject({ income: 10000, expense: 6000, net: 4000, expected: 9000, stale: false })
    expect(p.end.expected).toBe(5000 + 12 * 4000)
  })

  it('puts a yearly payment in its own month and flags it when the low edge drops under the cushion', () => {
    const insurance = series({ name: 'ביטוח', cadence: 'yearly', latestAmount: 20000, monthlyAmount: 1666.67, nextDate: '2030-09-12' })
    const p = ok(projectBalance(input({ series: [insurance], cushion: 1000 })))
    const sep = p.months.find(m => m.month === '2030-09')!
    expect(sep.expense).toBe(26000)
    expect(sep.expected).toBe(5000 + 4000 - 16000)
    expect(sep.tight).toBe(true)
    expect(p.tight.map(m => m.month)).toEqual(['2030-09', '2030-10'])
    expect(p.months.filter(m => m.expense === 26000)).toHaveLength(1)
  })

  it('does not add the card-payment series on top of the card line', () => {
    const payments = each(m => bank(`${m}-10`, { debit: 2000, isCardPayment: true }))
    const cardPaymentSeries = series({ isCardPayment: true, latestAmount: 2000, transactionIds: payments.map(r => r.id) })
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], series: [cardPaymentSeries] })))
    expect(p.months[0].expense).toBe(6000 + 2000)
  })

  it('widens the band with the horizon', () => {
    const rows = [...salaryAndRent(), ...each(m => bank(`${m}-15`, { debit: m <= '2030-03' ? 1000 : 3000, category: 'סופר' }))]
    const p = ok(projectBalance(input({ bank: rows })))
    expect(p.sigma).toBe(1000)
    expect(p.months[0].high - p.months[0].expected).toBe(1000)
    expect(p.months[3].high - p.months[3].expected).toBe(2000)
    expect(p.months[3].expected - p.months[3].low).toBe(2000)
  })

  it('projects the months since the last upload too, marked stale', () => {
    const p = ok(projectBalance(input({ today: '2030-09-10' })))
    expect(p.months[0]).toMatchObject({ month: '2030-08', stale: true })
    expect(p.months[1]).toMatchObject({ month: '2030-09', stale: true })
    expect(p.months[2]).toMatchObject({ month: '2030-10', stale: false })
    expect(p.months.at(-1)!.month).toBe('2031-09')
  })

  it('lists what went into the forecast', () => {
    const gym = series({ key: 'gym', name: 'חדר כושר', source: 'card', latestAmount: 150, monthlyAmount: 150 })
    const payments = each(m => bank(`${m}-10`, { debit: 900, isCardPayment: true }))
    const p = ok(projectBalance(input({ bank: [...salaryAndRent(), ...payments], series: [gym] })))
    expect(p.items).toEqual([
      { key: 'income:משכורת', name: 'משכורת', kind: 'everyday', direction: 'in', cadence: null, monthlyAmount: 10000, seriesKey: null },
      { key: 'expense:שכירות', name: 'שכירות', kind: 'everyday', direction: 'out', cadence: null, monthlyAmount: 6000, seriesKey: null },
      { key: 'card', name: 'כרטיסי אשראי', kind: 'card', direction: 'out', cadence: null, monthlyAmount: 900, seriesKey: null },
      { key: 'series:gym', name: 'חדר כושר', kind: 'recurring', direction: 'out', cadence: 'monthly', monthlyAmount: 150, seriesKey: 'gym' },
    ])
  })

  it('passes the cushion and the past balances through', () => {
    const past = [{ month: '2030-06', balance: 4800 }]
    const p = ok(projectBalance(input({ cushion: 2500, past })))
    expect(p.cushion).toBe(2500)
    expect(p.past).toEqual(past)
  })
})
```

The card item shows 900. The gym series has no transaction ids in the bank window, so nothing is taken out of the card payments. Its 150 is still projected separately, starting the month after its `nextDate`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run lib/insights/__tests__/projection.test.ts`
Expected: FAIL, `projectBalance is not a function` (or not exported).

- [ ] **Step 3: Implement** (append to `lib/insights/projection.ts`)

```ts
export interface ProjectionInput {
  /** YYYY-MM-DD */
  today: string
  cushion: number
  /** combined latest balance and the date of the latest row; null without bank data */
  start: { balance: number; date: string } | null
  /** non-ignored bank rows, from the window's first month on */
  bank: BankFlowRow[]
  /** non-ignored card rows of the cards in scope, from the window's first month on */
  cards: CardChargeRow[]
  series: ProjectionSeries[]
  /** actual month-end balances, oldest first: drawn before the forecast */
  past: { month: string; balance: number }[]
}

export interface ProjectedMonth {
  /** YYYY-MM */
  month: string
  income: number
  expense: number
  net: number
  expected: number
  low: number
  high: number
  /** between the latest data and today: projected, though it has already passed */
  stale: boolean
  tight: boolean
}

export interface ProjectionItem {
  key: string
  name: string
  kind: 'recurring' | 'everyday' | 'card'
  direction: 'in' | 'out'
  cadence: Cadence | null
  monthlyAmount: number
  /** the recurring series, for the link to /recurring */
  seriesKey: string | null
}

export type Projection =
  | { insufficient: true; completeMonths: number }
  | {
      insufficient: false
      start: { balance: number; date: string }
      end: ProjectedMonth
      months: ProjectedMonth[]
      tight: ProjectedMonth[]
      items: ProjectionItem[]
      past: { month: string; balance: number }[]
      cushion: number
      sigma: number
    }

export const CARD_ITEM_NAME = 'כרטיסי אשראי'

export function projectBalance(input: ProjectionInput): Projection {
  if (!input.start) return { insufficient: true, completeMonths: 0 }
  const last = monthKey(input.start.date)
  const window = Array.from({ length: WINDOW_MONTHS }, (_, i) => addMonths(last, i - WINDOW_MONTHS))
  const everyday = everydayFlows(input.bank, input.cards, input.series, window)
  if (everyday.months.length < MIN_MONTHS) return { insufficient: true, completeMonths: everyday.months.length }

  const thisMonth = monthKey(input.today)
  const first = addMonths(last, 1)
  const end = addMonths(thisMonth, HORIZON_MONTHS)
  const recurring = projectedSeries(input.series)
  const hits = new Map<string, number>()
  for (const s of recurring) for (const m of occurrences(s, first, end)) hits.set(m, (hits.get(m) ?? 0) + s.latestAmount)

  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0)
  const income = round2(sum(everyday.income))
  const baseExpense = sum(everyday.expense) + everyday.card

  const months: ProjectedMonth[] = []
  let expected = input.start.balance
  for (let month = first, k = 1; month <= end; month = addMonths(month, 1), k++) {
    const expense = round2(baseExpense + (hits.get(month) ?? 0))
    const net = round2(income - expense)
    expected = round2(expected + net)
    const spread = round2(everyday.sigma * Math.sqrt(k))
    const low = round2(expected - spread)
    months.push({
      month, income, expense, net, expected, low,
      high: round2(expected + spread),
      stale: month <= thisMonth,
      tight: low < input.cushion,
    })
  }

  const items: ProjectionItem[] = [
    ...Object.entries(everyday.income).map(([name, v]) => item(`income:${name}`, name, 'everyday', 'in', v)),
    ...Object.entries(everyday.expense).map(([name, v]) => item(`expense:${name}`, name, 'everyday', 'out', v)),
    ...(everyday.card > 0 ? [item('card', CARD_ITEM_NAME, 'card', 'out', everyday.card)] : []),
    ...recurring.map(s => ({ ...item(`series:${s.key}`, s.name, 'recurring', 'out', s.monthlyAmount), cadence: s.cadence, seriesKey: s.key })),
  ]

  return {
    insufficient: false,
    start: input.start,
    end: months[months.length - 1],
    months,
    tight: months.filter(m => m.tight),
    items,
    past: input.past,
    cushion: input.cushion,
    sigma: everyday.sigma,
  }
}

function item(key: string, name: string, kind: ProjectionItem['kind'], direction: ProjectionItem['direction'], monthlyAmount: number): ProjectionItem {
  return { key, name, kind, direction, cadence: null, monthlyAmount: round2(monthlyAmount), seriesKey: null }
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run lib/insights/__tests__/projection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/insights/projection.ts lib/insights/__tests__/projection.test.ts
git commit -m "Projection engine: months, range band and tight months"
```

---

### Task 3: The cushion setting and the DB layer

**Files:**
- Modify: `prisma/schema.prisma` (append the model)
- Create: `prisma/migrations/20261102120000_settings/migration.sql`
- Create: `lib/db/settings.ts`, `app/api/settings/route.ts`
- Create: `lib/db/projection.ts`
- Test: `lib/db/__tests__/settings.test.ts`, `app/api/settings/__tests__/route.test.ts`, `lib/db/__tests__/projection.test.ts`

**Interfaces:**
- Consumes: `projectBalance`, `ProjectionSeries`, `BankFlowRow`, `CardChargeRow`, `Projection`, `addMonths`, `monthKey`, `WINDOW_MONTHS` (Tasks 1–2). `getRecurringSeries` (`lib/db/recurring.ts`), `listAccounts` (`lib/db/accounts.ts`), `isCardPaymentRow` (`lib/insights/bank-categories.ts`), `combinedBalance` (`lib/insights/combined-balance.ts`), `toDay`/`fmt` (`lib/insights/recurring.ts`).
- Produces:
  - `CUSHION_KEY = 'projection.cushion'`, `CUSHION_MAX = 100_000_000`
  - `getCushion(): Promise<number>` and `setCushion(value: unknown): Promise<number>`. `setCushion` throws `SettingValidationError` (message in Hebrew).
  - `GET /api/settings` → `{ cushion: number }`. `PUT /api/settings` with body `{ cushion }` → 200 `{ cushion }` or 400 `{ error }`.
  - `getProjection(params?: { accountId?: string; today?: Date }): Promise<ProjectionPage>`, where `type ProjectionPage = Projection & { banks: { id: string; displayName: string }[]; accountId: string | null }` (`accountId` is null when showing all banks).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/db/__tests__/settings.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'

let db: TestDb
let settings: typeof import('../settings')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  settings = await import('../settings')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

describe('cushion setting', () => {
  it('is 0 until set', async () => {
    expect(await settings.getCushion()).toBe(0)
  })

  it('stores a non-negative amount', async () => {
    expect(await settings.setCushion(2500)).toBe(2500)
    expect(await settings.getCushion()).toBe(2500)
    expect(await settings.setCushion('3000')).toBe(3000)
  })

  it.each([[-1], ['abc'], [''], [null], [Number.NaN], [100_000_001]])('rejects %s and keeps the stored value', async bad => {
    await settings.setCushion(1200)
    await expect(settings.setCushion(bad)).rejects.toThrow(settings.SettingValidationError)
    expect(await settings.getCushion()).toBe(1200)
  })

  it('reads a broken stored value as 0', async () => {
    db.exec(`INSERT OR REPLACE INTO "Setting" ("key","value") VALUES ('projection.cushion','oops');`)
    expect(await settings.getCushion()).toBe(0)
  })
})```

```ts
// app/api/settings/__tests__/route.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

let db: TestDb
let route: typeof import('../route')

beforeAll(async () => {
  db = createTestDb()
  usePrismaOn(db)
  route = await import('../route')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const put = (body: unknown) =>
  route.PUT(new Request('http://x/api/settings', { method: 'PUT', body: JSON.stringify(body) }))

describe('/api/settings', () => {
  it('saves and returns the cushion', async () => {
    const res = await put({ cushion: 4000 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ cushion: 4000 })
    expect(await (await route.GET()).json()).toEqual({ cushion: 4000 })
  })

  it('rejects a bad amount in Hebrew', async () => {
    const res = await put({ cushion: -5 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/[א-ת]/)
  })

  it('rejects a broken body', async () => {
    const res = await route.PUT(new Request('http://x/api/settings', { method: 'PUT', body: '{' }))
    expect(res.status).toBe(400)
  })
})
```

Check how the existing route tests in `app/api/accounts/__tests__/route.test.ts` set up their DB, and copy that setup if it differs from the code above.

```ts
// lib/db/__tests__/projection.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction, ParsedCCTransaction } from '../../parsers/types'

let db: TestDb
let bank: typeof import('../bank')
let cards: typeof import('../cards')
let projection: typeof import('../projection')

// Made-up rows only. Bank 1 (acct_leumi) pays the MAX card; bank 2 has its own salary.
const bt = (month: number, over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, month - 1, 15),
  originalDescription: 'RENTCO',
  description: 'RENTCO',
  debit: 0,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'bank-test.xls',
  ...over,
})
const cc = (month: number, over: Partial<ParsedCCTransaction> = {}): ParsedCCTransaction => ({
  transactionDate: new Date(2030, month - 1, 5),
  billingDate: new Date(2030, month, 2),
  originalMerchantName: 'SHOPCO',
  merchantName: 'SHOPCO',
  category: 'Shopping',
  chargedAmount: 300,
  originalAmount: 300,
  originalCurrency: 'ILS',
  cardLastFour: '',
  transactionType: 'regular',
  notes: '',
  cardProvider: 'MAX',
  ...over,
})
const months = [1, 2, 3, 4, 5, 6, 7]

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES ('acct_bank2','BANK','leumi','Second bank',1900000000000);
UPDATE "Account" SET "payerAccountId"='acct_leumi' WHERE "id"='acct_max';
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cards = await import('../cards')
  projection = await import('../projection')
  await bank.upsertBankTransactions(
    [
      ...months.map(m => bt(m, { originalDescription: 'SALARYCO', description: 'SALARYCO', credit: 9000, date: new Date(2030, m - 1, 1), balance: 1000 + m * 100 })),
      ...months.map(m => bt(m, { debit: 4000, date: new Date(2030, m - 1, 9), balance: 900 + m * 100 })),
      ...months.map(m => bt(m, { originalDescription: 'מקס איט פיננסים', description: 'מקס איט פיננסים', debit: 300, date: new Date(2030, m - 1, 10), balance: 800 + m * 100 })),
    ],
    'acct_leumi'
  )
  await bank.upsertBankTransactions(
    months.map(m => bt(m, { originalDescription: 'OTHERJOB', description: 'OTHERJOB', credit: 2000, date: new Date(2030, m - 1, 3), balance: 5000 + m * 2000 })),
    'acct_bank2'
  )
  await cards.upsertCCTransactions(months.map(m => cc(m)), 'card.xlsx', 'acct_max')
})
afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const today = new Date(2030, 6, 20)

describe('getProjection', () => {
  it('combines every bank: starts from the sum of the latest balances', async () => {
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    // latest rows: acct_leumi 800+700 (card payment on the 10th is its last row), acct_bank2 5000+14000
    expect(p.start).toEqual({ balance: 1500 + 19000, date: '2030-07-10' })
    expect(p.accountId).toBeNull()
    expect(p.banks.map(b => b.id).sort()).toEqual(['acct_bank2', 'acct_leumi'])
    expect(p.months[0].income).toBe(9000 + 2000)
  })

  it('one bank: only its rows and the cards it pays', async () => {
    const p = await projection.getProjection({ accountId: 'acct_bank2', today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.accountId).toBe('acct_bank2')
    expect(p.start.balance).toBe(19000)
    expect(p.months[0].income).toBe(2000)
    expect(p.months[0].expense).toBe(0)
  })

  it('falls back to every bank for an unknown account id', async () => {
    const p = await projection.getProjection({ accountId: 'nope', today })
    expect(p.accountId).toBeNull()
  })

  it('uses the saved cushion', async () => {
    const settings = await import('../settings')
    await settings.setCushion(999999)
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.cushion).toBe(999999)
    expect(p.tight.length).toBe(p.months.length)
    await settings.setCushion(0)
  })

  it('draws the last months’ actual month-end balance', async () => {
    const p = await projection.getProjection({ today })
    if (p.insufficient) throw new Error('expected a projection')
    expect(p.past.at(-1)).toEqual({ month: '2030-07', balance: 1500 + 19000 })
  })
})
```

The last-row assumptions (the card payment on the 10th is acct_leumi's latest row) follow from the dates above. If `upsertBankTransactions` reorders or rejects rows, adjust the fixture rather than the code, and say so in the report.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run lib/db/__tests__/settings.test.ts app/api/settings lib/db/__tests__/projection.test.ts`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Add the table**

Append to `prisma/schema.prisma`:

```prisma
/// App preferences as key/value pairs (lib/db/settings.ts): the projection cushion, …
model Setting {
  key   String @id
  value String
}
```

```sql
-- prisma/migrations/20261102120000_settings/migration.sql
-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);
```

Run: `npx prisma generate`. Never point `migrate dev` at a real database. The tests build their own DBs from the migration files.

- [ ] **Step 4: Write `lib/db/settings.ts` and the route**

```ts
// lib/db/settings.ts
import { prisma } from './client'

export const CUSHION_KEY = 'projection.cushion'
export const CUSHION_MAX = 100_000_000

export class SettingValidationError extends Error {}

/** The safety cushion of the projection page (ENG-87): tight months dip under it. 0 until set. */
export async function getCushion(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: CUSHION_KEY } })
  const value = row ? Number(row.value) : 0
  return Number.isFinite(value) && value >= 0 ? value : 0
}

export async function setCushion(input: unknown): Promise<number> {
  const value = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : Number.NaN
  if (!Number.isFinite(value) || value < 0 || value > CUSHION_MAX) {
    throw new SettingValidationError('סכום הכרית צריך להיות מספר בין 0 ל-100,000,000')
  }
  const rounded = Math.round(value * 100) / 100
  await prisma.setting.upsert({
    where: { key: CUSHION_KEY },
    create: { key: CUSHION_KEY, value: String(rounded) },
    update: { value: String(rounded) },
  })
  return rounded
}
```

```ts
// app/api/settings/route.ts
import { NextResponse } from 'next/server'
import { getCushion, setCushion, SettingValidationError } from '@/lib/db/settings'

export const dynamic = 'force-dynamic'

/** The app's preferences: { cushion } (the projection page's safety cushion, ₪). */
export async function GET() {
  return NextResponse.json({ cushion: await getCushion() })
}

/** Body: { cushion: number }. 200 with the saved value, 400 with { error } in Hebrew. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  try {
    return NextResponse.json({ cushion: await setCushion((body as { cushion?: unknown }).cushion) })
  } catch (e) {
    if (e instanceof SettingValidationError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
```

- [ ] **Step 5: Write `lib/db/projection.ts`**

```ts
// lib/db/projection.ts
import { prisma } from './client'
import { listAccounts } from './accounts'
import { getRecurringSeries } from './recurring'
import { getCushion } from './settings'
import { combinedBalance, type BalancePoint } from '../insights/combined-balance'
import { isCardPaymentRow } from '../insights/bank-categories'
import { fmt, toDay } from '../insights/recurring'
import {
  WINDOW_MONTHS,
  addMonths,
  monthKey,
  projectBalance,
  type Projection,
  type ProjectionSeries,
} from '../insights/projection'

export type ProjectionPage = Projection & {
  banks: { id: string; displayName: string }[]
  /** the bank shown alone; null = every bank combined */
  accountId: string | null
}

const day = (d: Date) => fmt(toDay(d))
const firstOf = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/**
 * The projection (ENG-87) of every bank combined, or of one bank and the cards
 * it pays (Account.payerAccountId). An unknown account id shows every bank.
 */
export async function getProjection(params: { accountId?: string; today?: Date } = {}): Promise<ProjectionPage> {
  const today = params.today ?? new Date()
  const [bankAccounts, cardAccounts, cushion] = await Promise.all([
    listAccounts({ kind: 'BANK' }),
    listAccounts({ kind: 'CREDIT_CARD' }),
    getCushion(),
  ])
  const banks = bankAccounts.map(a => ({ id: a.id, displayName: a.displayName }))
  const accountId = params.accountId && banks.some(b => b.id === params.accountId) ? params.accountId : null
  const scope = accountId ? [accountId] : banks.map(b => b.id)
  const cardIds = cardAccounts.filter(c => (accountId ? c.payerAccountId === accountId : true)).map(c => c.id)
  const page = { banks, accountId }

  // Latest balance of each bank: ignored rows still carry the bank's running balance
  const latest = (
    await Promise.all(
      scope.map(id =>
        prisma.bankTransaction.findFirst({ where: { accountId: id }, orderBy: { date: 'desc' }, select: { date: true, balance: true } })
      )
    )
  ).filter((r): r is { date: Date; balance: number } => r !== null)
  if (latest.length === 0) return { insufficient: true, completeMonths: 0, ...page }
  const lastDate = latest.reduce((a, r) => (r.date > a ? r.date : a), latest[0].date)
  const start = { balance: Math.round(latest.reduce((a, r) => a + r.balance, 0) * 100) / 100, date: day(lastDate) }
  const windowStart = firstOf(addMonths(monthKey(start.date), -WINDOW_MONTHS))

  const [bankRows, cardRows, balanceRows, overview] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { accountId: { in: scope }, ignored: false, date: { gte: windowStart } },
      select: { id: true, date: true, debit: true, credit: true, category: true, description: true, originalDescription: true },
    }),
    prisma.creditCardTransaction.findMany({
      where: { accountId: { in: cardIds }, ignored: false, billingDate: { gte: windowStart } },
      select: { id: true, billingDate: true, chargedAmount: true },
    }),
    prisma.bankTransaction.findMany({
      where: { accountId: { in: scope }, date: { gte: windowStart } },
      orderBy: { date: 'desc' },
      select: { accountId: true, date: true, balance: true },
    }),
    getRecurringSeries({ accountId: [...scope, ...cardIds] }),
  ])

  const series: ProjectionSeries[] = overview.series.map(s => ({
    key: s.key,
    name: s.name,
    source: s.source,
    cadence: s.cadence,
    latestAmount: s.latestAmount,
    monthlyAmount: s.monthlyAmount,
    nextDate: s.nextDate,
    active: s.active,
    dismissed: s.status === 'dismissed',
    isCardPayment: s.isCardPayment,
    isInstallment: s.isInstallment,
    transactionIds: s.transactionIds,
  }))

  const projection = projectBalance({
    today: day(today),
    cushion,
    start,
    bank: bankRows.map(r => ({
      id: r.id,
      date: day(r.date),
      debit: r.debit,
      credit: r.credit,
      category: r.category,
      isCardPayment: isCardPaymentRow(r),
    })),
    cards: cardRows.map(r => ({ id: r.id, billingDate: day(r.billingDate), amount: r.chargedAmount })),
    series,
    past: monthEnds(balanceRows),
  })
  return { ...projection, ...page }
}

/** Combined month-end balances, oldest first, from rows newest first */
function monthEnds(rows: { accountId: string; date: Date; balance: number }[]): { month: string; balance: number }[] {
  const perAccount = new Map<string, BalancePoint[]>()
  for (const r of rows) {
    const points = perAccount.get(r.accountId) ?? []
    points.push({ date: day(r.date), balance: r.balance })
    perAccount.set(r.accountId, points)
  }
  const combined = combinedBalance([...perAccount.values()])
  const out = new Map<string, number>()
  for (const p of combined) if (!out.has(monthKey(p.date))) out.set(monthKey(p.date), p.balance)
  return [...out.entries()].map(([month, balance]) => ({ month, balance })).sort((a, b) => a.month.localeCompare(b.month))
}
```

Check `getRecurringSeries`'s `accountId` parameter type (`AccountFilter = string | string[] | undefined`). An empty card list still leaves the bank ids, so the array is never empty.

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx vitest run lib/db/__tests__/settings.test.ts app/api/settings lib/db/__tests__/projection.test.ts`
Expected: PASS. If an expected number in `projection.test.ts` is off because of how the fixture rows land (dates, the `@@unique` constraint), check the arithmetic against the fixture, fix the fixture or the expectation, and write down why in the report. Don't bend the engine.

- [ ] **Step 7: Add the cushion field to Settings**

```tsx
// components/settings/cushion-setting.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/** The projection's safety cushion (ENG-87): months whose low edge dips under it are flagged. */
export function CushionSetting({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial))
  const [saved, setSaved] = useState(String(initial))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  async function save() {
    if (value === saved) return
    setState('saving')
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cushion: value }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) {
      setSaved(String(body.cushion))
      setValue(String(body.cushion))
      setState('saved')
    } else {
      setError(body.error ?? 'השמירה נכשלה')
      setState('error')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl surface p-4 md:p-6">
      <div className="min-w-0">
        <label htmlFor="cushion" className="text-sm font-medium">כרית ביטחון</label>
        <p className="text-sm text-muted-foreground">חודש שבו היתרה עלולה לרדת מתחת לסכום הזה יסומן בתחזית</p>
        {/* Reserved line: the row keeps its height whether or not there's a message */}
        <p role="status" className={cn('min-h-5 text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {state === 'error' ? error : state === 'saved' ? 'נשמר' : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground" aria-hidden>₪</span>
        <input
          id="cushion"
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={e => { setValue(e.target.value); setState('idle') }}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-invalid={state === 'error' || undefined}
          className="h-9 w-32 rounded-lg border border-border bg-muted px-3 text-end text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
        />
      </div>
    </div>
  )
}
```

In `app/settings/page.tsx`, add `getCushion()` to the page's `Promise.all`. Then add a section after `#appearance`:

```tsx
<section id="projection" aria-labelledby="projection-title" className="space-y-3">
  <h2 id="projection-title" className="text-lg font-semibold">תחזית</h2>
  <CushionSetting initial={cushion} />
</section>
```

The input uses `text-base sm:text-sm`, so iOS doesn't zoom on focus (16px touch inputs, `docs/design-system.md`).

- [ ] **Step 8: Full suite and types**

Run: `npm test` and `npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add prisma lib/db/settings.ts lib/db/projection.ts lib/db/__tests__/settings.test.ts lib/db/__tests__/projection.test.ts app/api/settings components/settings/cushion-setting.tsx app/settings/page.tsx
git commit -m "Projection data: the cushion setting and the per-bank inputs"
```

---

### Task 4: Mockups (the owner's gate)

The controller does this, not an implementer subagent. It needs the owner.

- [ ] **Step 1:** Run `Artifact` `action: "quickstart"` with `intent: "design"`. Make **two** mockup options of `/projection` at desktop width and phone width (RTL, made-up numbers), following `docs/design-system.md`. Each option shows:
  - the headline: "בעוד 12 חודשים", the expected balance, the range, the change from today, and the reserved tight line;
  - the chart: actual line → dashed forecast, soft band, faint cushion line, markers on tight months;
  - the monthly table: month · in · out · end (expected / low), with tight rows labelled;
  - "מה נכנס לתחזית".
  The options should differ in layout: e.g. A puts the headline and chart in one hero card with the table below; B puts the headline beside the chart on desktop and the items list as a side column.
- [ ] **Step 2:** Ask the owner to pick (AskUserQuestion). Record the choice and any tweaks in the ledger.
- [ ] **Step 3:** Copy the chosen layout's decisions (order, grouping, which card is `.surface-hero`) into Task 5's brief as a "Mockup decision" note. Task 5's code below is option A. Adjust only the layout classes and the section order to match the pick. The data flow stays the same.

---

### Task 5: The page, its parts and the nav

**Files:**
- Create: `components/projection/projection-headline.tsx`, `components/projection/projection-chart.tsx`, `components/projection/projection-table.tsx`, `components/projection/projection-items.tsx`, `components/projection/bank-picker.tsx`
- Create: `lib/insights/projection-format.ts` (month labels and tight-line copy, pure)
- Create: `app/projection/page.tsx`
- Modify: `components/layout/nav-context.tsx` (`MAIN_NAV`), `components/layout/bottom-nav.tsx` (`MORE_LINKS`)
- Test: `lib/insights/__tests__/projection-format.test.ts`, `app/projection/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `getProjection`, `ProjectionPage` (Task 3); `ProjectedMonth`, `ProjectionItem` (Task 2). `RollingNumber` (`components/ui/rolling-number.tsx`), `SegmentedTrack` (`components/ui/segmented.tsx`), `SECTION`, `ChartHeader`, `EmptyState` (`components/accounts/page-parts.tsx`), `useChartAxes` (`hooks/use-chart-axes`), `useChartAnimation` (`hooks/use-chart-animation`), `formatCurrency` (`lib/utils/currency.ts`), `monthNameShort` (`lib/utils/date.ts`).
- Produces:
  - `monthLabel(month: string): string` gives `'מרץ 30'` style labels (short month name plus a 2-digit year), via `monthNameShort`.
  - `tightLine(tight: ProjectedMonth[]): string | null`. For example: `'צפוי להיות דחוק במרץ 31 — עד ₪1,200'`. With several tight months it names the lowest one and adds `' (ועוד 2 חודשים)'`. It returns null when nothing is tight.
  - The `/projection` page.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/insights/__tests__/projection-format.test.ts
import { describe, expect, it } from 'vitest'
import { monthLabel, tightLine } from '../projection-format'
import type { ProjectedMonth } from '../projection'

const m = (month: string, low: number): ProjectedMonth => ({
  month, income: 0, expense: 0, net: 0, expected: low, low, high: low, stale: false, tight: true,
})

describe('projection copy', () => {
  it('labels months short, with the year', () => {
    expect(monthLabel('2031-03')).toMatch(/31$/)
  })

  it('says nothing when no month is tight', () => {
    expect(tightLine([])).toBeNull()
  })

  it('names the lowest tight month and counts the rest', () => {
    const line = tightLine([m('2030-09', 800), m('2030-10', -200), m('2030-11', 400)])!
    expect(line).toContain(monthLabel('2030-10'))
    expect(line).toContain('ועוד 2 חודשים')
  })

  it('names a single tight month without a count', () => {
    expect(tightLine([m('2030-09', 800)])).not.toContain('ועוד')
  })
})
```

```tsx
// app/projection/__tests__/page.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ProjectionPage } from '@/lib/db/projection'

const banks = [{ id: 'b1', displayName: 'בנק לדוגמה' }]
const month = (month: string, expected: number, tight = false) => ({
  month, income: 10000, expense: 6000, net: 4000, expected, low: expected - 500, high: expected + 500, stale: false, tight,
})
let page: ProjectionPage
vi.mock('@/lib/db/projection', () => ({ getProjection: async () => page }))
vi.mock('next/navigation', () => ({ usePathname: () => '/projection', useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

async function render() {
  const { default: ProjectionPage } = await import('../page')
  return renderToStaticMarkup(await ProjectionPage({ searchParams: Promise.resolve({}) }))
}

describe('/projection', () => {
  it('shows the headline, the table and what went in', async () => {
    const months = Array.from({ length: 12 }, (_, i) => month(`2031-${String(i + 1).padStart(2, '0')}`, 9000 + i * 4000))
    page = {
      insufficient: false, banks, accountId: null, cushion: 0, sigma: 500,
      start: { balance: 5000, date: '2030-12-03' }, months, end: months[11], tight: [], past: [],
      items: [{ key: 'income:משכורת', name: 'משכורת', kind: 'everyday', direction: 'in', cadence: null, monthlyAmount: 10000, seriesKey: null }],
    }
    const html = await render()
    expect(html).toContain('בעוד 12 חודשים')
    expect(html).toContain('<h1')
    expect(html).toContain('תחזית')
    expect(html.match(/<tr/g)!.length).toBe(13)
    expect(html).toContain('משכורת')
    expect(html).toContain('href="/recurring"')
  })

  it('reserves the tight line, and fills it when a month is tight', async () => {
    const months = Array.from({ length: 12 }, (_, i) => month(`2031-${String(i + 1).padStart(2, '0')}`, 1000, i === 2))
    page = { ...page, months, end: months[11], tight: [months[2]], cushion: 2000 } as ProjectionPage
    const html = await render()
    expect(html).toContain('data-tight-line')
    expect(html).toContain('דחוק')
  })

  it('asks for more months when there is not enough history', async () => {
    page = { insufficient: true, completeMonths: 2, banks, accountId: null }
    const html = await render()
    expect(html).toContain('3 חודשים')
    expect(html).toContain('href="/upload"')
  })

  it('shows the picker only with more than one bank', async () => {
    page = { insufficient: true, completeMonths: 0, banks, accountId: null }
    expect(await render()).not.toContain('data-bank-picker')
    page = { insufficient: true, completeMonths: 0, banks: [...banks, { id: 'b2', displayName: 'עוד בנק' }], accountId: null }
    expect(await render()).toContain('data-bank-picker')
  })
})
```

The headline uses `RollingNumber`. The chart uses Recharts `ResponsiveContainer`, which renders an empty box in SSR, so the page test needs no chart mocks. If `RollingNumber` or a hook breaks node rendering, add a `vi.mock` for that one module, following `components/*/__tests__`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run lib/insights/__tests__/projection-format.test.ts app/projection`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Write the copy helpers**

```ts
// lib/insights/projection-format.ts
import { monthNameShort } from '@/lib/utils/date'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import type { ProjectedMonth } from './projection'

/** '2031-03' → short month name and 2-digit year */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${monthNameShort(m)} ${String(y).slice(2)}`
}

/** The one quiet line under the headline: the lowest tight month, and how many others */
export function tightLine(tight: ProjectedMonth[]): string | null {
  if (tight.length === 0) return null
  const lowest = tight.reduce((a, m) => (m.low < a.low ? m : a))
  const others = tight.length - 1
  return `צפוי להיות דחוק ב${monthLabel(lowest.month)} — עד ${formatCurrencyWhole(lowest.low)}${others ? ` (ועוד ${others} חודשים)` : ''}`
}
```

Check what `formatCurrencyWhole` and `monthNameShort` return in `lib/utils/` and use them as they are.

- [ ] **Step 4: Write the parts**

```tsx
// components/projection/projection-headline.tsx
import { RollingNumber } from '@/components/ui/rolling-number'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { tightLine } from '@/lib/insights/projection-format'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'

/** The page's one hero figure: the expected balance in 12 months, its range, and the tight months */
export function ProjectionHeadline({ start, end, tight }: { start: number; end: ProjectedMonth; tight: ProjectedMonth[] }) {
  const change = end.expected - start
  const line = tightLine(tight)
  return (
    <section className="surface-hero rounded-xl p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">בעוד 12 חודשים</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-[2.75rem]"><RollingNumber value={end.expected} /></p>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">
        בין {formatCurrencyWhole(end.low)} ל-{formatCurrencyWhole(end.high)} ·{' '}
        <span className={change >= 0 ? 'text-[hsl(var(--income))]' : 'text-[hsl(var(--expense))]'}>
          {change >= 0 ? '+' : '−'}{formatCurrencyWhole(Math.abs(change))}
        </span>{' '}מהיום
      </p>
      {/* Reserved: the row is there whether or not a month is tight (stable layout) */}
      <p data-tight-line className={cn('mt-3 min-h-5 text-sm', line ? 'text-foreground' : 'invisible')} aria-hidden={!line || undefined}>
        {line ?? '—'}
      </p>
    </section>
  )
}
```

```tsx
// components/projection/projection-chart.tsx
'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from 'next-themes'
import { useChartAxes } from '@/hooks/use-chart-axes'
import { useChartAnimation } from '@/hooks/use-chart-animation'
import { ChartHeader, SECTION } from '@/components/accounts/page-parts'
import { formatCurrency } from '@/lib/utils/currency'
import { monthLabel } from '@/lib/insights/projection-format'
import type { ProjectedMonth } from '@/lib/insights/projection'

interface Row { label: string; actual?: number; expected?: number; band?: [number, number]; tight?: boolean }

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const row: Row = payload[0].payload
  return (
    <div className="rounded-lg surface-overlay px-3 py-2 text-sm">
      <p className="mb-0.5 text-xs text-muted-foreground">{label}</p>
      {row.actual !== undefined && <p className="font-semibold tabular-nums">{formatCurrency(row.actual)}</p>}
      {row.expected !== undefined && row.band && (
        <>
          <p className="font-semibold tabular-nums">{formatCurrency(row.expected)}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(row.band[0])} – {formatCurrency(row.band[1])}</p>
        </>
      )}
    </div>
  )
}

/** Actual month-end balance, then the forecast as a dashed line in its band */
export function ProjectionChart({ past, months, start, cushion }: {
  past: { month: string; balance: number }[]
  months: ProjectedMonth[]
  start: number
  cushion: number
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  // The same axis colours as the other charts (docs/design-system.md, Known gaps)
  const textColor = isDark ? '#8a9ab0' : '#607080'
  const gridColor = isDark ? '#283040' : '#e2e8ed'
  const axes = useChartAxes(textColor)
  const anim = useChartAnimation()

  const actual: Row[] = past.map(p => ({ label: monthLabel(p.month), actual: p.balance }))
  // The forecast starts where the actual line ends, so the two join
  if (actual.length) {
    const last = actual[actual.length - 1]
    last.expected = start
    last.band = [start, start]
  }
  const forecast: Row[] = months.map(m => ({ label: monthLabel(m.month), expected: m.expected, band: [m.low, m.high], tight: m.tight }))
  const data = [...actual, ...forecast]

  return (
    <section className={SECTION}>
      <ChartHeader title="יתרה צפויה" subtitle="קו מלא: בפועל · מקווקו: תחזית, עם טווח" />
      <div dir="ltr" className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={axes.margin}>
            <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 4" />
            <XAxis dataKey="label" {...axes.xAxis} interval="preserveStartEnd" />
            <YAxis {...axes.yAxis} />
            <Tooltip content={<ChartTooltip />} />
            <Area {...anim} dataKey="band" stroke="none" fill="var(--chart-1)" fillOpacity={0.14} isAnimationActive={false} />
            <ReferenceLine y={cushion} stroke={textColor} strokeOpacity={0.5} strokeDasharray="2 4" />
            <Line {...anim} dataKey="actual" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line {...anim} dataKey="expected" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="6 5" dot={false} />
            {forecast.filter(r => r.tight).map(r => (
              <ReferenceDot key={r.label} x={r.label} y={r.expected} r={4} fill="var(--chart-expense)" stroke="none" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
```

The axis colours copy the pattern the existing charts use. That pattern is listed in the doc's Known gaps, and fixing it is a separate follow-up, so don't invent new tokens here.

```tsx
// components/projection/projection-table.tsx
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { monthLabel } from '@/lib/insights/projection-format'
import { SECTION, ChartHeader } from '@/components/accounts/page-parts'
import type { ProjectedMonth } from '@/lib/insights/projection'
import { cn } from '@/lib/utils/cn'

/** One row per month; the tight label's cell is there on every row (stable layout) */
export function ProjectionTable({ months }: { months: ProjectedMonth[] }) {
  return (
    <section className={SECTION}>
      <ChartHeader title="חודש אחר חודש" subtitle="הכנסות, הוצאות ויתרה צפויה בסוף כל חודש" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 text-start font-medium">חודש</th>
              <th className="py-2 text-end font-medium">נכנס</th>
              <th className="py-2 text-end font-medium">יוצא</th>
              <th className="py-2 text-end font-medium">יתרה צפויה</th>
              <th className="w-16 py-2"><span className="sr-only">מצב</span></th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.month} className={cn('border-t border-border', m.stale && 'text-muted-foreground')}>
                <td className="py-2.5">{monthLabel(m.month)}</td>
                <td className="py-2.5 text-end text-[hsl(var(--income))]">{formatCurrencyWhole(m.income)}</td>
                <td className="py-2.5 text-end">{formatCurrencyWhole(m.expense)}</td>
                <td className="py-2.5 text-end">
                  <span className="block font-medium text-foreground">{formatCurrencyWhole(m.expected)}</span>
                  <span className="block text-xs text-muted-foreground">עד {formatCurrencyWhole(m.low)}</span>
                </td>
                <td className="py-2.5 text-end">
                  <span className={cn('rounded-md bg-[hsl(var(--expense)/0.12)] px-2 py-0.5 text-xs font-medium text-[hsl(var(--expense))]', !m.tight && 'invisible')}>
                    דחוק
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

```tsx
// components/projection/projection-items.tsx
import Link from 'next/link'
import { formatCurrencyWhole } from '@/lib/utils/currency'
import { SECTION, ChartHeader } from '@/components/accounts/page-parts'
import type { ProjectionItem } from '@/lib/insights/projection'

const CADENCE: Record<string, string> = { weekly: 'שבועי', monthly: 'חודשי', bimonthly: 'דו-חודשי', yearly: 'שנתי' }

/** What the forecast is made of; recurring items link to /recurring, where an ended one can be dismissed */
export function ProjectionItems({ items }: { items: ProjectionItem[] }) {
  return (
    <section className={SECTION}>
      <ChartHeader title="מה נכנס לתחזית" subtitle="ממוצע חודשי (חציון של 6 החודשים האחרונים) וחיובים קבועים" />
      <ul className="divide-y divide-border text-sm">
        {items.map(i => (
          <li key={i.key} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate">
              {i.name}
              {i.cadence && <span className="ms-2 text-xs text-muted-foreground">{CADENCE[i.cadence]}</span>}
            </span>
            <span className={i.direction === 'in' ? 'tabular-nums text-[hsl(var(--income))]' : 'tabular-nums'}>
              {i.direction === 'in' ? '+' : '−'}{formatCurrencyWhole(i.monthlyAmount)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/recurring" className="mt-4 inline-block text-sm text-primary hover:underline">
        חיוב הסתיים? סמנו אותו בחיובים קבועים
      </Link>
    </section>
  )
}
```

```tsx
// components/projection/bank-picker.tsx
'use client'

import Link from 'next/link'
import { SegmentedTrack } from '@/components/ui/segmented'

/** All banks, or one: the segmented control the app uses for small choices */
export function BankPicker({ banks, active }: { banks: { id: string; displayName: string }[]; active: string | null }) {
  const options = [{ key: 'all', label: 'כל הבנקים', href: '/projection' }, ...banks.map(b => ({ key: b.id, label: b.displayName, href: `/projection?account=${b.id}` }))]
  const current = active ?? 'all'
  return (
    <SegmentedTrack
      as="nav"
      aria-label="בחירת בנק"
      data-bank-picker
      active={current}
      thumbClassName="rounded-md bg-card shadow-e1"
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted p-0.5"
    >
      {options.map(o => (
        <Link
          key={o.key}
          href={o.href}
          data-segment={o.key}
          data-on={o.key === current || undefined}
          aria-current={o.key === current ? 'page' : undefined}
          className="relative whitespace-nowrap rounded-md px-3 py-1 text-sm"
        >
          {o.label}
        </Link>
      ))}
    </SegmentedTrack>
  )
}
```

Check that `SegmentedTrack` passes through unknown props such as `data-bank-picker` and `aria-label`. It spreads `...rest` onto the tag. If it doesn't, put the `data-bank-picker` attribute on a wrapping `div`.

- [ ] **Step 5: Write the page**

```tsx
// app/projection/page.tsx
import { CalendarClock, Upload } from 'lucide-react'
import { getProjection } from '@/lib/db/projection'
import { EmptyState } from '@/components/accounts/page-parts'
import { BankPicker } from '@/components/projection/bank-picker'
import { ProjectionHeadline } from '@/components/projection/projection-headline'
import { ProjectionChart } from '@/components/projection/projection-chart'
import { ProjectionTable } from '@/components/projection/projection-table'
import { ProjectionItems } from '@/components/projection/projection-items'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'תחזית · תזרים' }

/** The next 12 months of the bank balance (ENG-87, docs/superpowers/specs/2026-11-02-projection-design.md) */
export default async function ProjectionPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams
  const p = await getProjection({ accountId: account })

  return (
    <div className="page-in min-w-0 space-y-6">
      <div className="flex min-h-[2.375rem] flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">תחזית</h1>
        {p.banks.length > 1 && <BankPicker banks={p.banks} active={p.accountId} />}
      </div>

      {p.insufficient ? (
        <EmptyState
          icon={p.banks.length ? CalendarClock : Upload}
          title={p.banks.length ? 'צריך עוד קצת היסטוריה' : 'אין עדיין חשבון בנק'}
          text={
            p.banks.length
              ? `כדי לחזות את השנה הקרובה צריך לפחות 3 חודשים מלאים של תנועות בנק. יש כרגע ${p.completeMonths}.`
              : 'הוסיפו חשבון בנק והעלו לפחות 3 חודשים של תנועות כדי לראות תחזית.'
          }
          actions={[{ href: '/upload', label: 'העלאת קבצים', icon: Upload, primary: true }]}
        />
      ) : (
        <>
          <ProjectionHeadline start={p.start.balance} end={p.end} tight={p.tight} />
          <ProjectionChart past={p.past} months={p.months} start={p.start.balance} cushion={p.cushion} />
          <ProjectionTable months={p.months} />
          <ProjectionItems items={p.items} />
        </>
      )}
    </div>
  )
}
```

Check that `lucide-react` exports `CalendarClock`. If it doesn't, use `CalendarRange`.

- [ ] **Step 6: Nav entries**

In `components/layout/nav-context.tsx` `MAIN_NAV`, add this after the `/recurring` item, and import `TrendingUp` from `lucide-react`:

```ts
{ type: 'link', href: '/projection', label: 'תחזית', icon: TrendingUp },
```

In `components/layout/bottom-nav.tsx` `MORE_LINKS`, add this as the first entry, with the same import:

```ts
{ href: '/projection', label: 'תחזית', hint: 'היתרה הצפויה בשנה הקרובה', icon: TrendingUp },
```

If a nav test lists the items (`grep -rn "MAIN_NAV\|MORE_LINKS" components lib app --include=*.test.*`), update it.

- [ ] **Step 7: Run the tests and see them pass**

Run: `npx vitest run lib/insights/__tests__/projection-format.test.ts app/projection`, then `npm test` and `npx tsc --noEmit`.
Expected: all pass.

- [ ] **Step 8: Smoke-check it**

Run `npx next dev -p 3001` in the worktree. If the page 500s on the empty worktree DB, run `npx prisma migrate deploy` first. `curl -s localhost:3001/projection` should return 200 and show the empty state ("אין עדיין חשבון בנק"). Then stop the server. The controller does the visual check with demo data.

- [ ] **Step 9: Commit**

```bash
git add app/projection components/projection lib/insights/projection-format.ts lib/insights/__tests__/projection-format.test.ts components/layout
git commit -m "The projection page: headline, chart, monthly table and what went in"
```

---

### Task 6: Check with demo data and open the PR (controller)

- [ ] **Step 1:** Seed demo data into a worktree DB. Check how the :3000 demo DB is made (`grep -rn "demo" package.json scripts prisma | head`). Then serve on :3001 and check `/projection` in the browser:
  - the headline rolls;
  - the band widens;
  - setting a high cushion in Settings → תחזית flags tight months (marker, table label and headline line);
  - the bank picker switches;
  - dark mode works;
  - at 360px there is no sideways scroll;
  - the RTL table reads right.
- [ ] **Step 2:** Run `npm test`, `npx tsc --noEmit`, and `next build` + `next start` in the worktree (not the :3000 folder). Check that `/projection` returns 200.
- [ ] **Step 3:** Scan the diff for real data, and check that every commit uses the noreply email.
- [ ] **Step 4:** Push, then open a PR titled `feat: projection page — 12-month balance forecast with tight-month warnings`. Base it on `main` once #24 has merged. Until then, base it on `feat/design-system` and say so in the body. Link ENG-87.
