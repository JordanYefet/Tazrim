# Tazrim Improvements v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bank parser, add user-managed categories with bulk merchant updates and merchant click-to-filter, make charts responsive, and wire the month selector to filter transactions.

**Architecture:** Next.js 15 App Router. Server components fetch via internal HTTP. Client components own their own navigation (useRouter). A new `Category` Prisma model stores the category enum. Merchant filter travels as `?merchant=` in the URL.

**Tech Stack:** Next.js 15, Prisma + SQLite, Recharts, TailwindCSS, TypeScript.

---

## File Map

```
Modified:
  lib/parsers/bank-leumi.ts                        — dynamic header scan
  lib/db/cards.ts                                  — add bulkUpdateCCCategory
  lib/db/aliases.ts                                — add bulkAliasAndUpdate
  app/api/aliases/route.ts                         — PATCH support + bulk CC update
  app/api/bank/transactions/route.ts               — merchant param
  app/api/cards/max/transactions/route.ts          — merchant param
  app/api/cards/max/transactions/[id]/route.ts     — bulk category update on save
  components/layout/sidebar.tsx                    — add /categories nav
  components/layout/bottom-nav.tsx                 — add /categories nav
  components/cards/max/max-transactions-table.tsx  — category dropdown + merchant filter
  components/bank/transactions-table.tsx           — merchant click filter
  components/bank/income-expense-chart.tsx         — responsive + bar click
  components/bank/balance-chart.tsx                — responsive
  components/cards/max/category-donut.tsx          — responsive
  components/cards/max/monthly-spending-chart.tsx  — responsive + bar click
  components/dashboard/combined-chart.tsx          — responsive
  app/bank/page.tsx                                — default year, merchant param, selectedMonth
  app/cards/max/page.tsx                           — default year, merchant param, selectedMonth
  prisma/schema.prisma                             — Category model

Created:
  lib/db/categories.ts                             — CRUD for Category
  app/api/categories/route.ts                      — GET + POST
  app/api/categories/[id]/route.ts                 — PATCH + DELETE
  app/categories/page.tsx                          — management page
  components/categories/category-list.tsx          — manage category enum
  components/categories/merchant-mappings.tsx      — manage aliases
```

---

## Task 1: Bank Leumi Parser Fix

**Files:**
- Modify: `lib/parsers/bank-leumi.ts`
- Modify: `lib/parsers/__tests__/bank-leumi.test.ts`

- [ ] **Step 1: Add a failing test for flexible table detection**

Add to `lib/parsers/__tests__/bank-leumi.test.ts`:

```typescript
const SAMPLE_HTML_EXTRA_TABLE = `
<HTML dir="RTL"><body>
<table><tr><td>כותרת ראשית</td></tr></table>
<table><tr><td>מידע כללי</td></tr></table>
<table>
  <tr><td>תנועות בחשבון</td></tr>
  <tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
  <tr><td>21/04/2026</td><td>משכורת</td><td>0.00</td><td>2,500.00</td><td>15,250.00</td><td></td></tr>
</table>
</body></HTML>
`

describe('parseBankLeumi — flexible structure', () => {
  it('finds transactions even when they are in the 3rd table', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML_EXTRA_TABLE), 'test.xls')
    expect(transactions).toHaveLength(1)
    expect(transactions[0].credit).toBe(2500)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npm test -- lib/parsers/__tests__/bank-leumi.test.ts 2>&1 | tail -8
```

Expected: 1 new test FAIL (existing 7 still pass).

- [ ] **Step 3: Rewrite `lib/parsers/bank-leumi.ts`**

```typescript
import { parse as parseHtml } from 'node-html-parser'
import type { ParsedBankTransaction, ParseResult } from './types'

function parseAmount(val: string): number {
  return parseFloat(val.replace(/,/g, '')) || 0
}

function parseDate(val: string): Date {
  const [day, month, year] = val.split('/')
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
}

export function parseBankLeumi(
  buffer: Buffer,
  fileName: string
): ParseResult<ParsedBankTransaction> {
  const root = parseHtml(buffer.toString('utf-8'))
  const tables = root.querySelectorAll('table')

  for (const table of tables) {
    const rows = table.querySelectorAll('tr')
    let headerRowIndex = -1

    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td, th').map(td => td.text.trim())
      if (cells[0] === 'תאריך') { headerRowIndex = i; break }
    }

    if (headerRowIndex === -1) continue

    const transactions: ParsedBankTransaction[] = []
    const dataRows = Array.from(rows).slice(headerRowIndex + 1)

    for (const row of dataRows) {
      const cells = row.querySelectorAll('td, th').map(td => td.text.trim())
      if (!cells[0] || !cells[0].includes('/')) continue

      const desc = cells[1]?.trim() ?? ''
      transactions.push({
        date: parseDate(cells[0]),
        originalDescription: desc,
        description: desc,
        debit: parseAmount(cells[2] ?? '0'),
        credit: parseAmount(cells[3] ?? '0'),
        balance: parseAmount(cells[4] ?? '0'),
        note: cells[5]?.trim() ?? '',
        sourceFile: fileName,
      })
    }

    return { transactions, errors: [] }
  }

  return { transactions: [], errors: ['לא נמצאה טבלת עסקאות בקובץ'] }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- lib/parsers/__tests__/bank-leumi.test.ts 2>&1 | tail -8
```

Expected: 8 tests pass (7 original + 1 new).

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bank-leumi.ts lib/parsers/__tests__/bank-leumi.test.ts
git commit -m "fix: make bank parser find transaction table dynamically by header row"
```

---

## Task 2: Prisma Category Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/db/categories.ts`

- [ ] **Step 1: Add Category model to `prisma/schema.prisma`**

Add after the `UploadHistory` model, before the enums:

```prisma
model Category {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npx prisma migrate dev --name add-category 2>&1 | tail -10
```

Expected: migration applied, `Category` table created in `prisma/tazrim.db`.

- [ ] **Step 3: Write `lib/db/categories.ts`**

```typescript
import { prisma } from './client'

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } })
}

export async function createCategory(name: string) {
  return prisma.category.create({ data: { name } })
}

export async function renameCategory(id: string, name: string) {
  return prisma.category.update({ where: { id }, data: { name } })
}

export async function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } })
}
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ lib/db/categories.ts
git commit -m "feat: add Category model and CRUD helpers"
```

---

## Task 3: Category API Routes

**Files:**
- Create: `app/api/categories/route.ts`
- Create: `app/api/categories/[id]/route.ts`

- [ ] **Step 1: Create `app/api/categories/route.ts`**

```bash
mkdir -p /Users/jordanyefetberman/Git/Personal/Tazrim/app/api/categories/\[id\]
```

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCategories, createCategory } from '@/lib/db/categories'

export async function GET() {
  const categories = await getCategories()
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  const category = await createCategory(name.trim())
  return NextResponse.json(category)
}
```

- [ ] **Step 2: Create `app/api/categories/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { renameCategory, deleteCategory } from '@/lib/db/categories'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'שם קטגוריה נדרש' }, { status: 400 })
  const category = await renameCategory(id, name.trim())
  return NextResponse.json(category)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await deleteCategory(id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/categories/
git commit -m "feat: add category CRUD API routes"
```

---

## Task 4: Bulk Category Update Logic

**Files:**
- Modify: `lib/db/cards.ts`
- Modify: `lib/db/aliases.ts`
- Modify: `app/api/aliases/route.ts`
- Modify: `app/api/cards/max/transactions/[id]/route.ts`

- [ ] **Step 1: Add `bulkUpdateCCCategory` to `lib/db/cards.ts`**

Add this function at the end of `lib/db/cards.ts`:

```typescript
export async function bulkUpdateCCCategory(
  originalMerchantName: string,
  categoryOverride: string
) {
  return prisma.creditCardTransaction.updateMany({
    where: { originalMerchantName },
    data: { categoryOverride },
  })
}
```

- [ ] **Step 2: Add `upsertAliasAndBulkUpdate` to `lib/db/aliases.ts`**

Add this import at the top of `lib/db/aliases.ts`:

```typescript
import { prisma } from './client'
import type { AliasSource } from '@prisma/client'
```

Replace the existing imports (they already have `prisma` and `AliasSource`) and add this function at the end:

```typescript
export async function upsertAliasAndBulkUpdate(params: {
  source: AliasSource
  originalName: string
  displayName: string
  categoryOverride?: string
}) {
  const alias = await prisma.transactionAlias.upsert({
    where: { source_originalName: { source: params.source, originalName: params.originalName } },
    update: { displayName: params.displayName, categoryOverride: params.categoryOverride },
    create: params,
  })

  if (params.categoryOverride && (params.source === 'MAX' || params.source === 'HITECH')) {
    await prisma.creditCardTransaction.updateMany({
      where: { originalMerchantName: params.originalName },
      data: { categoryOverride: params.categoryOverride },
    })
  }

  return alias
}
```

- [ ] **Step 3: Update `app/api/aliases/route.ts` to add PATCH**

Replace the file with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAliases, upsertAlias, upsertAliasAndBulkUpdate } from '@/lib/db/aliases'
import type { AliasSource } from '@prisma/client'

export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get('source') as AliasSource | null
  const aliases = await getAliases(source ?? undefined)
  return NextResponse.json(aliases)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const alias = await upsertAlias(body)
  return NextResponse.json(alias)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const alias = await upsertAliasAndBulkUpdate({
    source: body.source,
    originalName: body.originalName,
    displayName: body.displayName,
    categoryOverride: body.categoryOverride,
  })
  return NextResponse.json(alias)
}
```

- [ ] **Step 4: Update `app/api/cards/max/transactions/[id]/route.ts` to bulk-update on category save**

Replace the file with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { updateCCTransaction, bulkUpdateCCCategory } from '@/lib/db/cards'
import { upsertAlias } from '@/lib/db/aliases'
import { prisma } from '@/lib/db/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const tx = await prisma.creditCardTransaction.findUnique({ where: { id } })
  if (!tx) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  const updated = await updateCCTransaction(id, {
    merchantName: body.merchantName,
    categoryOverride: body.categoryOverride,
  })

  if (body.categoryOverride) {
    await bulkUpdateCCCategory(tx.originalMerchantName, body.categoryOverride)
    await upsertAlias({
      source: 'MAX',
      originalName: tx.originalMerchantName,
      displayName: tx.merchantName,
      categoryOverride: body.categoryOverride,
    })
  }

  if (body.merchantName) {
    await upsertAlias({
      source: 'MAX',
      originalName: tx.originalMerchantName,
      displayName: body.merchantName,
      categoryOverride: body.categoryOverride,
    })
  }

  return NextResponse.json(updated)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/cards.ts lib/db/aliases.ts app/api/aliases/route.ts \
  "app/api/cards/max/transactions/[id]/route.ts"
git commit -m "feat: add bulk category update on merchant alias save"
```

---

## Task 5: Merchant Filter in API Routes

**Files:**
- Modify: `app/api/bank/transactions/route.ts`
- Modify: `app/api/cards/max/transactions/route.ts`
- Modify: `lib/db/bank.ts`
- Modify: `lib/db/cards.ts`

- [ ] **Step 1: Add `merchant` param support to `lib/db/bank.ts`**

In `getBankTransactions`, add `merchant?: string` to the params type and add the filter. Replace the function signature and `search` block:

```typescript
export async function getBankTransactions(params: {
  month?: number
  year?: number
  search?: string
  merchant?: string
}) {
  const where: Prisma.BankTransactionWhereInput = {}

  if (params.year) {
    const m = params.month
    where.date = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.merchant) {
    where.description = params.merchant
  } else if (params.search) {
    where.description = { contains: params.search }
  }

  return prisma.bankTransaction.findMany({ where, orderBy: { date: 'desc' } })
}
```

- [ ] **Step 2: Add `merchant` param support to `lib/db/cards.ts`**

In `getCCTransactions`, add `merchant?: string` to the params type:

```typescript
export async function getCCTransactions(params: {
  provider: CardProvider
  month?: number
  year?: number
  search?: string
  merchant?: string
}) {
  const where: Prisma.CreditCardTransactionWhereInput = {
    cardProvider: params.provider,
  }

  if (params.year) {
    const m = params.month
    where.transactionDate = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.merchant) {
    where.merchantName = params.merchant
  } else if (params.search) {
    where.merchantName = { contains: params.search }
  }

  return prisma.creditCardTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
  })
}
```

- [ ] **Step 3: Update `app/api/bank/transactions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getBankTransactions } from '@/lib/db/bank'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined
  const merchant = sp.get('merchant') ?? undefined

  const transactions = await getBankTransactions({ year, month, search, merchant })
  return NextResponse.json(transactions)
}
```

- [ ] **Step 4: Update `app/api/cards/max/transactions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCCTransactions } from '@/lib/db/cards'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined
  const merchant = sp.get('merchant') ?? undefined

  const transactions = await getCCTransactions({ provider: 'MAX', year, month, search, merchant })
  return NextResponse.json(transactions)
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/bank.ts lib/db/cards.ts \
  app/api/bank/transactions/route.ts \
  app/api/cards/max/transactions/route.ts
git commit -m "feat: add merchant exact-match filter to bank and CC transaction APIs"
```

---

## Task 6: Navigation + Categories Management Page

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/bottom-nav.tsx`
- Create: `components/categories/category-list.tsx`
- Create: `components/categories/merchant-mappings.tsx`
- Create: `app/categories/page.tsx`

- [ ] **Step 1: Update `components/layout/sidebar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload, Tag } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק לאומי', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-56 flex-col border-l bg-card">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-primary">תזרים</h1>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 2: Update `components/layout/bottom-nav.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload, Tag } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/upload', label: 'העלאה', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 md:hidden border-t bg-card flex">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex flex-col items-center gap-1 flex-1 py-2 text-xs transition-colors',
            pathname === href ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Create `components/categories/category-list.tsx`**

```bash
mkdir -p /Users/jordanyefetberman/Git/Personal/Tazrim/components/categories
```

```typescript
'use client'

import { useState } from 'react'

interface Category { id: string; name: string }

export function CategoryList({ initial }: { initial: Category[] }) {
  const [categories, setCategories] = useState(initial)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    if (!newName.trim()) return
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    const cat = await res.json()
    setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    setError(null)
  }

  async function save() {
    if (!editing) return
    const res = await fetch(`/api/categories/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.name }),
    })
    if (!res.ok) { setError('שם כבר קיים'); return }
    const updated = await res.json()
    setCategories(prev => prev.map(c => c.id === updated.id ? updated : c).sort((a, b) => a.name.localeCompare(b.name)))
    setEditing(null)
    setError(null)
  }

  async function remove(id: string) {
    await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="border rounded-md px-3 py-1.5 text-sm bg-background flex-1"
          placeholder="שם קטגוריה חדשה"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button
          onClick={add}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
        >
          הוסף
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="divide-y border rounded-lg bg-card">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center justify-between px-3 py-2 gap-2">
            {editing?.id === cat.id ? (
              <input
                autoFocus
                className="border rounded px-2 py-0.5 text-sm bg-background flex-1"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                onBlur={save}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null) }}
              />
            ) : (
              <span
                className="text-sm flex-1 cursor-pointer hover:text-primary"
                onClick={() => setEditing({ id: cat.id, name: cat.name })}
              >
                {cat.name}
              </span>
            )}
            <button
              onClick={() => remove(cat.id)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              מחק
            </button>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">אין קטגוריות עדיין</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/categories/merchant-mappings.tsx`**

```typescript
'use client'

import { useState } from 'react'

interface Alias {
  id: string
  source: string
  originalName: string
  displayName: string
  categoryOverride: string | null
}

interface Category { id: string; name: string }

const SOURCE_LABELS: Record<string, string> = { BANK: 'בנק לאומי', MAX: 'מקס', HITECH: 'הייטקזון' }

export function MerchantMappings({ initial, categories }: { initial: Alias[]; categories: Category[] }) {
  const [aliases, setAliases] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDisplay, setEditDisplay] = useState('')

  async function saveDisplayName(alias: Alias) {
    await fetch('/api/aliases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: alias.source,
        originalName: alias.originalName,
        displayName: editDisplay,
        categoryOverride: alias.categoryOverride,
      }),
    })
    setAliases(prev => prev.map(a => a.id === alias.id ? { ...a, displayName: editDisplay } : a))
    setEditingId(null)
  }

  async function saveCategory(alias: Alias, categoryOverride: string) {
    await fetch('/api/aliases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: alias.source,
        originalName: alias.originalName,
        displayName: alias.displayName,
        categoryOverride,
      }),
    })
    setAliases(prev => prev.map(a => a.id === alias.id ? { ...a, categoryOverride } : a))
  }

  if (!aliases.length) {
    return <p className="text-sm text-muted-foreground">לא קיימים מיפויים עדיין. העלה קבצים כדי להתחיל.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-right py-2 px-3 font-medium">שם מקורי</th>
            <th className="text-right py-2 px-3 font-medium">שם תצוגה</th>
            <th className="text-right py-2 px-3 font-medium">קטגוריה</th>
            <th className="text-right py-2 px-3 font-medium">מקור</th>
          </tr>
        </thead>
        <tbody>
          {aliases.map(alias => (
            <tr key={alias.id} className="border-b hover:bg-accent/30">
              <td className="py-2 px-3 text-muted-foreground">{alias.originalName}</td>
              <td className="py-2 px-3">
                {editingId === alias.id ? (
                  <input
                    autoFocus
                    className="border rounded px-1 py-0.5 text-sm bg-background w-full"
                    value={editDisplay}
                    onChange={e => setEditDisplay(e.target.value)}
                    onBlur={() => saveDisplayName(alias)}
                    onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(alias); if (e.key === 'Escape') setEditingId(null) }}
                  />
                ) : (
                  <span
                    className="cursor-pointer hover:text-primary"
                    onClick={() => { setEditingId(alias.id); setEditDisplay(alias.displayName) }}
                  >
                    {alias.displayName}
                  </span>
                )}
              </td>
              <td className="py-2 px-3">
                <select
                  className="text-sm border rounded px-1 py-0.5 bg-background"
                  value={alias.categoryOverride ?? ''}
                  onChange={e => saveCategory(alias, e.target.value)}
                >
                  <option value="">— ללא —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 px-3">{SOURCE_LABELS[alias.source] ?? alias.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/categories/page.tsx`**

```bash
mkdir -p /Users/jordanyefetberman/Git/Personal/Tazrim/app/categories
```

```typescript
import { CategoryList } from '@/components/categories/category-list'
import { MerchantMappings } from '@/components/categories/merchant-mappings'

async function getData() {
  const base = 'http://localhost:3000'
  const [catRes, aliasRes] = await Promise.all([
    fetch(`${base}/api/categories`, { cache: 'no-store' }),
    fetch(`${base}/api/aliases`, { cache: 'no-store' }),
  ])
  const categories = await catRes.json()
  const aliases = await aliasRes.json()
  return { categories, aliases }
}

export default async function CategoriesPage() {
  const { categories, aliases } = await getData()

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold">קטגוריות ומיפויי עסקים</h1>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">ניהול קטגוריות</h2>
        <CategoryList initial={categories} />
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">מיפויי עסקים</h2>
        <MerchantMappings initial={aliases} categories={categories} />
      </section>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/layout/sidebar.tsx components/layout/bottom-nav.tsx \
  components/categories/ app/categories/
git commit -m "feat: add categories management page with category list and merchant mappings"
```

---

## Task 7: CC Transactions Table — Category Dropdown + Merchant Filter

**Files:**
- Modify: `components/cards/max/max-transactions-table.tsx`

- [ ] **Step 1: Rewrite `components/cards/max/max-transactions-table.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { X } from 'lucide-react'

interface CCTx {
  id: string
  transactionDate: string
  billingDate: string
  merchantName: string
  originalMerchantName: string
  category: string
  categoryOverride: string | null
  chargedAmount: number
  originalAmount: number
  originalCurrency: string
}

interface Category { id: string; name: string }

export function MaxTransactionsTable({
  transactions: initial,
  categories,
}: {
  transactions: CCTx[]
  categories: Category[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [transactions, setTransactions] = useState(initial)
  const activeMerchant = params.get('merchant')

  async function saveCategory(tx: CCTx, categoryOverride: string) {
    await fetch(`/api/cards/max/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryOverride }),
    })
    setTransactions(prev =>
      prev.map(t => t.originalMerchantName === tx.originalMerchantName
        ? { ...t, categoryOverride }
        : t
      )
    )
  }

  function filterMerchant(name: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('merchant', name)
    router.push(`/cards/max?${sp.toString()}`)
  }

  function clearMerchant() {
    const sp = new URLSearchParams(params.toString())
    sp.delete('merchant')
    router.push(`/cards/max?${sp.toString()}`)
  }

  return (
    <div className="space-y-2">
      {activeMerchant && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">מסנן:</span>
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {activeMerchant}
            <button onClick={clearMerchant} aria-label="הסר מסנן"><X className="h-3 w-3" /></button>
          </span>
        </div>
      )}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['תאריך עסקה','שם בית עסק','קטגוריה','סכום חיוב','תאריך חיוב'].map(h => (
                  <th key={h} className="text-right py-2 px-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b hover:bg-accent/30 transition-colors">
                  <td className="py-2 px-3 whitespace-nowrap">{formatDate(tx.transactionDate)}</td>
                  <td className="py-2 px-3 min-w-[160px]">
                    <span
                      className="cursor-pointer hover:underline hover:text-primary"
                      onClick={() => filterMerchant(tx.merchantName)}
                    >
                      {tx.merchantName}
                    </span>
                  </td>
                  <td className="py-2 px-3 min-w-[140px]">
                    <select
                      className="text-sm border rounded px-1 py-0.5 bg-background w-full"
                      value={tx.categoryOverride ?? tx.category}
                      onChange={e => saveCategory(tx, e.target.value)}
                    >
                      <option value={tx.category}>{tx.category}</option>
                      {categories
                        .filter(c => c.name !== tx.category)
                        .map(c => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                  </td>
                  <td className="py-2 px-3 text-red-600 dark:text-red-400 whitespace-nowrap">
                    {formatCurrency(tx.chargedAmount)}
                    {tx.originalCurrency !== '₪' && (
                      <span className="text-xs text-muted-foreground mr-1">
                        ({tx.originalAmount} {tx.originalCurrency})
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{formatDate(tx.billingDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="text-center py-8 text-muted-foreground text-sm">אין עסקאות לתקופה זו</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/cards/max/page.tsx` to pass categories and merchant param**

```typescript
import { MaxSummaryCards } from '@/components/cards/max/max-summary-cards'
import { CategoryDonut } from '@/components/cards/max/category-donut'
import { MonthlySpendingChart } from '@/components/cards/max/monthly-spending-chart'
import { MaxTransactionsTable } from '@/components/cards/max/max-transactions-table'

interface SearchParams { year?: string; month?: string; search?: string; merchant?: string }

async function getMaxData(params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ?? String(new Date().getMonth() + 1)
  const base = 'http://localhost:3000'

  const sp = new URLSearchParams({ year })
  if (params.month) sp.set('month', params.month)
  if (params.search) sp.set('search', params.search)
  if (params.merchant) sp.set('merchant', params.merchant)

  const [txRes, summaryRes, catRes, categoriesRes] = await Promise.all([
    fetch(`${base}/api/cards/max/transactions?${sp}`, { cache: 'no-store' }),
    fetch(`${base}/api/summary?year=${year}`, { cache: 'no-store' }),
    fetch(`${base}/api/cards/max/transactions?year=${year}&month=${month}`, { cache: 'no-store' }),
    fetch(`${base}/api/categories`, { cache: 'no-store' }),
  ])

  const transactions = await txRes.json()
  const summary = await summaryRes.json()
  const monthlyTxs = await catRes.json()
  const categories = await categoriesRes.json()

  const categoryTotals: Record<string, number> = {}
  for (const tx of monthlyTxs) {
    const cat = tx.categoryOverride ?? tx.category
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + tx.chargedAmount
  }

  return { transactions, maxSummary: summary.max, categoryTotals, categories }
}

export default async function MaxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { transactions, maxSummary, categoryTotals, categories } = await getMaxData(params)
  const month = Number(params.month ?? new Date().getMonth() + 1)
  const total = transactions.reduce((s: number, t: { chargedAmount: number }) => s + t.chargedAmount, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">מקס כרטיס אשראי</h1>
      <MaxSummaryCards total={total} count={transactions.length} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryDonut data={categoryTotals} />
        <MonthlySpendingChart data={maxSummary} selectedMonth={month} />
      </div>
      <MaxTransactionsTable transactions={transactions} categories={categories} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/cards/max/max-transactions-table.tsx app/cards/max/page.tsx
git commit -m "feat: CC table — category dropdown with bulk update, merchant click filter"
```

---

## Task 8: Bank Transactions Table — Merchant Click Filter

**Files:**
- Modify: `components/bank/transactions-table.tsx`
- Modify: `app/bank/page.tsx`

- [ ] **Step 1: Update `components/bank/transactions-table.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'
import { X } from 'lucide-react'

interface BankTx {
  id: string
  date: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
}

export function BankTransactionsTable({ transactions: initial }: { transactions: BankTx[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [transactions, setTransactions] = useState(initial)
  const [editing, setEditing] = useState<{ id: string; field: 'note'; value: string } | null>(null)
  const activeMerchant = params.get('merchant')

  async function saveEdit() {
    if (!editing) return
    await fetch(`/api/bank/transactions/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [editing.field]: editing.value }),
    })
    setTransactions(prev =>
      prev.map(t => t.id === editing.id ? { ...t, [editing.field]: editing.value } : t)
    )
    setEditing(null)
  }

  function filterMerchant(description: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set('merchant', description)
    router.push(`/bank?${sp.toString()}`)
  }

  function clearMerchant() {
    const sp = new URLSearchParams(params.toString())
    sp.delete('merchant')
    router.push(`/bank?${sp.toString()}`)
  }

  return (
    <div className="space-y-2">
      {activeMerchant && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">מסנן:</span>
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
            {activeMerchant}
            <button onClick={clearMerchant} aria-label="הסר מסנן"><X className="h-3 w-3" /></button>
          </span>
        </div>
      )}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['תאריך','תיאור','חובה','זכות','יתרה','הערה'].map(h => (
                  <th key={h} className="text-right py-2 px-3 font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} className="border-b hover:bg-accent/30 transition-colors">
                  <td className="py-2 px-3 whitespace-nowrap">{formatDate(tx.date)}</td>
                  <td className="py-2 px-3 min-w-[140px]">
                    <span
                      className="cursor-pointer hover:underline hover:text-primary"
                      onClick={() => filterMerchant(tx.description)}
                    >
                      {tx.description}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-red-600 dark:text-red-400">
                    {tx.debit > 0 ? formatCurrency(tx.debit) : ''}
                  </td>
                  <td className="py-2 px-3 text-green-600 dark:text-green-400">
                    {tx.credit > 0 ? formatCurrency(tx.credit) : ''}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{formatCurrency(tx.balance)}</td>
                  <td className="py-2 px-3 min-w-[120px]">
                    {editing?.id === tx.id && editing.field === 'note' ? (
                      <input
                        autoFocus
                        className="w-full border rounded px-1 py-0.5 text-sm bg-background"
                        value={editing.value}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                        onBlur={saveEdit}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-primary text-muted-foreground"
                        onClick={() => setEditing({ id: tx.id, field: 'note', value: tx.note })}
                      >
                        {tx.note || '+ הוסף הערה'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="text-center py-8 text-muted-foreground text-sm">אין עסקאות לתקופה זו</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `app/bank/page.tsx`**

```typescript
import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'

interface SearchParams { year?: string; month?: string; search?: string; merchant?: string }

async function getBankData(params: SearchParams) {
  const year = params.year ?? String(new Date().getFullYear())
  const base = 'http://localhost:3000'

  const sp = new URLSearchParams({ year })
  if (params.month) sp.set('month', params.month)
  if (params.search) sp.set('search', params.search)
  if (params.merchant) sp.set('merchant', params.merchant)

  const [txRes, summaryRes] = await Promise.all([
    fetch(`${base}/api/bank/transactions?${sp}`, { cache: 'no-store' }),
    fetch(`${base}/api/summary?year=${year}`, { cache: 'no-store' }),
  ])

  const transactions = await txRes.json()
  const summary = await summaryRes.json()
  return { transactions, bankSummary: summary.bank as Record<number, { income: number; expense: number }> }
}

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { transactions, bankSummary } = await getBankData(params)

  const month = Number(params.month ?? new Date().getMonth() + 1)

  const monthData = bankSummary[month] ?? { income: 0, expense: 0 }
  const chartData = Object.entries(bankSummary).map(([m, d]) => ({
    month: Number(m),
    income: (d as { income: number }).income,
    expense: (d as { expense: number }).expense,
  }))

  const balancePoints = transactions.map((tx: { date: string; balance: number }) => ({
    date: tx.date,
    balance: tx.balance,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">בנק לאומי</h1>
      <BankSummaryCards income={monthData.income} expense={monthData.expense} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <IncomeExpenseChart data={chartData} selectedMonth={month} />
        <BalanceChart data={balancePoints} />
      </div>
      <BankTransactionsTable transactions={transactions} />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/bank/transactions-table.tsx app/bank/page.tsx
git commit -m "feat: bank table — click description to filter by merchant"
```

---

## Task 9: Responsive Charts + Bar Click Navigation

**Files:**
- Modify: `components/bank/income-expense-chart.tsx`
- Modify: `components/bank/balance-chart.tsx`
- Modify: `components/cards/max/category-donut.tsx`
- Modify: `components/cards/max/monthly-spending-chart.tsx`
- Modify: `components/dashboard/combined-chart.tsx`

- [ ] **Step 1: Rewrite `components/bank/income-expense-chart.tsx`**

```typescript
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface MonthData { month: number; income: number; expense: number }

export function IncomeExpenseChart({ data, selectedMonth }: { data: MonthData[]; selectedMonth?: number }) {
  const router = useRouter()
  const params = useSearchParams()

  const chartData = data.map(d => ({
    month: d.month,
    name: monthName(d.month),
    הכנסות: d.income,
    הוצאות: d.expense,
  }))

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`/bank?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">הכנסות מול הוצאות</h3>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }} onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="הכנסות" radius={[3, 3, 0, 0]} cursor="pointer">
              {chartData.map(entry => (
                <Cell key={entry.month} fill="#22c55e" opacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.35} />
              ))}
            </Bar>
            <Bar dataKey="הוצאות" radius={[3, 3, 0, 0]} cursor="pointer">
              {chartData.map(entry => (
                <Cell key={entry.month} fill="#ef4444" opacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.35} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `components/bank/balance-chart.tsx`**

```typescript
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface TxPoint { date: string; balance: number }

export function BalanceChart({ data }: { data: TxPoint[] }) {
  const chartData = [...data].reverse().map(d => ({
    date: formatDate(d.date),
    יתרה: d.balance,
  }))

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">יתרת חשבון לאורך זמן</h3>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Line type="monotone" dataKey="יתרה" stroke="#22c55e" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `components/cards/max/category-donut.tsx`**

```typescript
'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils/currency'

const COLORS = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16','#14b8a6']

export function CategoryDonut({ data }: { data: Record<string, number> }) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">הוצאות לפי קטגוריה</h3>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="35%" outerRadius="60%" paddingAngle={2}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite `components/cards/max/monthly-spending-chart.tsx`**

```typescript
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useRouter, useSearchParams } from 'next/navigation'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface Props { data: Record<number, number>; selectedMonth?: number }

export function MonthlySpendingChart({ data, selectedMonth }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  const chartData = Object.entries(data).map(([m, total]) => ({
    month: Number(m),
    name: monthName(Number(m)),
    הוצאות: total,
  }))

  function handleClick(entry: { month: number }) {
    const sp = new URLSearchParams(params.toString())
    sp.set('month', String(entry.month))
    router.push(`/cards/max?${sp.toString()}`)
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">הוצאות חודשיות</h3>
      <div className="h-48 sm:h-64 md:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }} onClick={e => e?.activePayload && handleClick(e.activePayload[0].payload)}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="הוצאות" radius={[3, 3, 0, 0]} cursor="pointer">
              {chartData.map(entry => (
                <Cell key={entry.month} fill="#ef4444" opacity={!selectedMonth || selectedMonth === entry.month ? 1 : 0.35} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite `components/dashboard/combined-chart.tsx`**

```typescript
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface Props {
  bankSummary: Record<number, { income: number; expense: number }>
  maxSummary: Record<number, number>
}

export function CombinedChart({ bankSummary, maxSummary }: Props) {
  const chartData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const bank = bankSummary[m] ?? { income: 0, expense: 0 }
    return {
      name: monthName(m),
      'הכנסות בנק': bank.income,
      'הוצאות בנק': bank.expense,
      'חיובי מקס': maxSummary[m] ?? 0,
    }
  })

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">סיכום חודשי — כל המקורות</h3>
      <div className="h-48 sm:h-64 md:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="הכנסות בנק" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="הוצאות בנק" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="חיובי מקס" fill="#f97316" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/bank/income-expense-chart.tsx components/bank/balance-chart.tsx \
  components/cards/max/category-donut.tsx components/cards/max/monthly-spending-chart.tsx \
  components/dashboard/combined-chart.tsx
git commit -m "fix: make all charts responsive and add bar click month navigation"
```

---

## Task 10: Full Test + Build Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npm test 2>&1 | tail -8
```

Expected: All tests pass (8+ tests).

- [ ] **Step 2: Build**

```bash
npm run build 2>&1 | tail -15
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Start dev server and verify**

```bash
npm run dev
```

Manual checks:
- Upload a Bank Leumi `.xls` — should show "X עסקאות חדשות" > 0.
- Go to `/categories`, add a category (e.g. "סופר"), verify it appears.
- On `/cards/max`, change a transaction's category to "סופר" via dropdown — all rows with same merchant should update.
- Click a merchant name on `/bank` — filter chip appears, table narrows.
- Select a month in the header — transactions table filters. Click a bar in the chart — URL updates and table filters.
- Rotate/narrow browser window — charts scale down without clipping.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Tazrim v1.1 — parser fix, categories, merchant filter, responsive charts, month filter"
```
