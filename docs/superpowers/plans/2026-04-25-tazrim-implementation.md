# Tazrim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local home-server finance dashboard that imports Bank Leumi and Max credit card files, stores transactions in SQLite, and presents monthly/yearly income, expense, and category charts in Hebrew RTL.

**Architecture:** Next.js 15 App Router with API routes replacing a separate backend. Prisma + SQLite for persistence. All file parsing happens server-side in API routes. No authentication.

**Tech Stack:** Next.js 15, TypeScript, TailwindCSS, shadcn/ui, Recharts, Prisma + SQLite, next-themes, xlsx (SheetJS), node-html-parser, Vitest.

---

## File Map

```
Tazrim/
├── app/
│   ├── layout.tsx                              # Root layout: RTL, ThemeProvider
│   ├── globals.css                             # Tailwind base + shadcn CSS vars
│   ├── page.tsx                                # Dashboard
│   ├── bank/page.tsx                           # Bank Leumi page
│   ├── cards/max/page.tsx                      # Max CC page
│   ├── upload/page.tsx                         # Upload page
│   └── api/
│       ├── upload/route.ts                     # POST multipart file upload
│       ├── upload/history/route.ts             # GET upload history
│       ├── bank/transactions/route.ts          # GET with filters
│       ├── bank/transactions/[id]/route.ts     # PATCH description/note
│       ├── cards/max/transactions/route.ts     # GET with filters
│       ├── cards/max/transactions/[id]/route.ts# PATCH merchantName/category
│       ├── summary/route.ts                    # GET aggregated totals
│       └── aliases/route.ts                    # GET/POST aliases
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx                         # Desktop nav
│   │   ├── bottom-nav.tsx                      # Mobile nav
│   │   └── header.tsx                          # Period selector + theme toggle
│   ├── dashboard/
│   │   ├── summary-cards.tsx
│   │   └── combined-chart.tsx
│   ├── bank/
│   │   ├── bank-summary-cards.tsx
│   │   ├── income-expense-chart.tsx
│   │   ├── balance-chart.tsx
│   │   └── transactions-table.tsx
│   ├── cards/max/
│   │   ├── max-summary-cards.tsx
│   │   ├── category-donut.tsx
│   │   ├── monthly-spending-chart.tsx
│   │   └── max-transactions-table.tsx
│   └── upload/
│       ├── upload-zone.tsx
│       └── upload-history-table.tsx
├── lib/
│   ├── parsers/
│   │   ├── types.ts
│   │   ├── bank-leumi.ts
│   │   ├── max-cc.ts
│   │   └── __tests__/
│   │       ├── bank-leumi.test.ts
│   │       └── max-cc.test.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── bank.ts
│   │   ├── cards.ts
│   │   ├── aliases.ts
│   │   └── upload.ts
│   └── utils/
│       ├── date.ts
│       └── currency.ts
├── hooks/use-period.ts
├── prisma/schema.prisma
├── vitest.config.ts
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
└── postcss.config.mjs
```

---

## Task 1: Scaffold Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "tazrim",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack -H 0.0.0.0",
    "build": "next build",
    "start": "next start -H 0.0.0.0",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev --name init",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "^15.3.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "^6.6.0",
    "next-themes": "^0.4.4",
    "recharts": "^2.15.3",
    "xlsx": "^0.18.5",
    "node-html-parser": "^6.1.13",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",
    "lucide-react": "^0.488.0",
    "@radix-ui/react-dropdown-menu": "^2.1.6",
    "@radix-ui/react-select": "^2.1.6",
    "@radix-ui/react-slot": "^1.2.0",
    "@radix-ui/react-separator": "^1.1.2",
    "@radix-ui/react-label": "^2.1.4",
    "@radix-ui/react-tooltip": "^1.1.8",
    "@radix-ui/react-dialog": "^1.1.6"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5",
    "tailwindcss": "^3.4.17",
    "postcss": "^8",
    "autoprefixer": "^10.0.1",
    "eslint": "^9",
    "eslint-config-next": "^15",
    "prisma": "^6.6.0",
    "vitest": "^2.2.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
}

export default nextConfig
```

- [ ] **Step 4: Write `postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
export default config
```

- [ ] **Step 5: Write `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 6: Write `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 7: Write `.gitignore`**

```
node_modules/
.next/
.env
.env.local
prisma/*.db
prisma/*.db-journal
```

- [ ] **Step 8: Install dependencies**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts vitest.config.ts .gitignore
git commit -m "feat: scaffold Next.js 15 project with dependencies"
```

---

## Task 2: Prisma Schema + DB Client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/db/client.ts`

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./tazrim.db"
}

model BankTransaction {
  id                  String   @id @default(uuid())
  date                DateTime
  originalDescription String
  description         String
  debit               Float    @default(0)
  credit              Float    @default(0)
  balance             Float
  note                String   @default("")
  sourceFile          String

  @@unique([date, originalDescription, debit, credit])
}

model CreditCardTransaction {
  id                   String       @id @default(uuid())
  transactionDate      DateTime
  billingDate          DateTime
  originalMerchantName String
  merchantName         String
  category             String
  categoryOverride     String?
  chargedAmount        Float
  originalAmount       Float
  originalCurrency     String
  cardLastFour         String
  transactionType      String
  notes                String       @default("")
  cardProvider         CardProvider

  @@unique([transactionDate, originalMerchantName, chargedAmount, cardProvider])
}

model TransactionAlias {
  id               String      @id @default(uuid())
  source           AliasSource
  originalName     String
  displayName      String
  categoryOverride String?

  @@unique([source, originalName])
}

model UploadHistory {
  id          String      @id @default(uuid())
  fileName    String
  uploadedAt  DateTime    @default(now())
  recordCount Int
  source      AliasSource
}

enum CardProvider {
  MAX
  HITECH
}

enum AliasSource {
  BANK
  MAX
  HITECH
}
```

- [ ] **Step 2: Generate Prisma client and run migration**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npx prisma migrate dev --name init
```

Expected: `prisma/tazrim.db` created, `prisma/migrations/` folder created.

- [ ] **Step 3: Write `lib/db/client.ts`**

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Commit**

```bash
git add prisma/ lib/db/client.ts
git commit -m "feat: add Prisma schema with SQLite and DB client singleton"
```

---

## Task 3: Global Styles + Root Layout

**Files:**
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/providers.tsx`
- Create: `lib/utils/cn.ts`

- [ ] **Step 1: Write `lib/utils/cn.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 142 76% 36%;
    --primary-foreground: 355 100% 97%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 142 76% 36%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 142 70% 45%;
    --primary-foreground: 144 61% 20%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 142 70% 45%;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 3: Write `app/providers.tsx`**

```typescript
'use client'

import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </ThemeProvider>
  )
}
```

- [ ] **Step 4: Write `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomNav } from '@/components/layout/bottom-nav'
import { Header } from '@/components/layout/header'

export const metadata: Metadata = {
  title: 'תזרים',
  description: 'ניהול פיננסי אישי',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Header />
              <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
                {children}
              </main>
            </div>
          </div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx app/providers.tsx lib/utils/cn.ts
git commit -m "feat: add root layout with RTL Hebrew support and ThemeProvider"
```

---

## Task 4: Navigation Components

**Files:**
- Create: `components/layout/sidebar.tsx`
- Create: `components/layout/bottom-nav.tsx`
- Create: `components/layout/header.tsx`

- [ ] **Step 1: Write `components/layout/sidebar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק לאומי', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
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

- [ ] **Step 2: Write `components/layout/bottom-nav.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/upload', label: 'העלאה', icon: Upload },
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

- [ ] **Step 3: Write `components/layout/header.tsx`**

```typescript
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { theme, setTheme } = useTheme()

  const now = new Date()
  const year = Number(params.get('year') ?? now.getFullYear())
  const month = Number(params.get('month') ?? now.getMonth() + 1)

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    sp.set(key, value)
    router.push(`${pathname}?${sp.toString()}`)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b bg-card gap-4">
      <div className="flex items-center gap-2">
        <select
          className="text-sm border rounded-md px-2 py-1 bg-background"
          value={month}
          onChange={e => update('month', e.target.value)}
        >
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="text-sm border rounded-md px-2 py-1 bg-background"
          value={year}
          onChange={e => update('year', e.target.value)}
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="החלף ערכת נושא"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </header>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/layout/
git commit -m "feat: add sidebar, bottom nav, and header with period selector"
```

---

## Task 5: Parser Types

**Files:**
- Create: `lib/parsers/types.ts`

- [ ] **Step 1: Write `lib/parsers/types.ts`**

```typescript
export interface ParsedBankTransaction {
  date: Date
  originalDescription: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
  sourceFile: string
}

export interface ParsedCCTransaction {
  transactionDate: Date
  billingDate: Date
  originalMerchantName: string
  merchantName: string
  category: string
  chargedAmount: number
  originalAmount: number
  originalCurrency: string
  cardLastFour: string
  transactionType: string
  notes: string
  cardProvider: 'MAX' | 'HITECH'
}

export interface ParseResult<T> {
  transactions: T[]
  errors: string[]
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/parsers/types.ts
git commit -m "feat: add parser type definitions"
```

---

## Task 6: Bank Leumi Parser + Tests

**Files:**
- Create: `lib/parsers/bank-leumi.ts`
- Create: `lib/parsers/__tests__/bank-leumi.test.ts`

- [ ] **Step 1: Write failing tests — `lib/parsers/__tests__/bank-leumi.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseBankLeumi } from '../bank-leumi'

const SAMPLE_HTML = `
<HTML dir="RTL"><body>
<table>
  <tr><td>היתרה ₪15,250.00</td><td>מסגרת 0.00</td><td>25.04.26</td></tr>
</table>
<table>
  <tr><td>תנועות בחשבון</td></tr>
  <tr><td>תאריך</td><td>תיאור</td><td>בחובה</td><td>בזכות</td><td>היתרה בש"ח</td><td>הערה</td></tr>
  <tr><td>21/04/2026</td><td>משכורת</td><td>0.00</td><td>2,500.00</td><td>15,250.00</td><td></td></tr>
  <tr><td>19/04/2026</td><td>העברה דיגיטל</td><td>980.00</td><td>0.00</td><td>12,750.00</td><td>הערה כלשהי</td></tr>
  <tr><td></td></tr>
</table>
</body></HTML>
`

describe('parseBankLeumi', () => {
  it('returns 2 transactions skipping title, header, and empty rows', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions).toHaveLength(2)
  })

  it('parses date DD/MM/YYYY correctly', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].date).toEqual(new Date(2026, 3, 21))
  })

  it('parses credit amount removing commas', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].credit).toBe(2500)
    expect(transactions[0].debit).toBe(0)
  })

  it('parses debit amount correctly', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[1].debit).toBe(980)
    expect(transactions[1].credit).toBe(0)
  })

  it('sets description equal to originalDescription by default', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].description).toBe(transactions[0].originalDescription)
  })

  it('captures note field', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[1].note).toBe('הערה כלשהי')
  })

  it('stores sourceFile', () => {
    const { transactions } = parseBankLeumi(Buffer.from(SAMPLE_HTML), 'test.xls')
    expect(transactions[0].sourceFile).toBe('test.xls')
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npm test -- lib/parsers/__tests__/bank-leumi.test.ts
```

Expected: FAIL — `Cannot find module '../bank-leumi'`

- [ ] **Step 3: Write `lib/parsers/bank-leumi.ts`**

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

  if (tables.length < 2) {
    return { transactions: [], errors: ['לא נמצאה טבלת עסקאות בקובץ'] }
  }

  const rows = tables[1].querySelectorAll('tr')
  // rows[0] = title "תנועות בחשבון", rows[1] = headers, rows[2+] = data
  const dataRows = Array.from(rows).slice(2)

  const transactions: ParsedBankTransaction[] = []

  for (const row of dataRows) {
    const cells = row.querySelectorAll('td, th').map(td => td.text.trim())
    // Skip empty rows and footer rows (no valid date)
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- lib/parsers/__tests__/bank-leumi.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/bank-leumi.ts lib/parsers/__tests__/bank-leumi.test.ts
git commit -m "feat: add Bank Leumi HTML-XLS parser with tests"
```

---

## Task 7: Max CC Parser + Tests

**Files:**
- Create: `lib/parsers/max-cc.ts`
- Create: `lib/parsers/__tests__/max-cc.test.ts`

- [ ] **Step 1: Write failing tests — `lib/parsers/__tests__/max-cc.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseMaxCC } from '../max-cc'
import * as XLSX from 'xlsx'

const HEADER_ROW = [
  'תאריך עסקה','שם בית העסק','קטגוריה','4 ספרות אחרונות של כרטיס האשראי',
  'סוג עסקה','סכום חיוב','מטבע חיוב','סכום עסקה מקורי','מטבע עסקה מקורי',
  'תאריך חיוב','הערות','תיוגים','מועדון הנחות','מפתח דיסקונט',
  'אופן ביצוע ההעסקה','שער המרה ממטבע מקור/התחשבנות לש"ח',
]

function buildWorkbook(dataRows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const rows = [
    ['כל המשתמשים (1)', ''],
    ['כל הכרטיסים (1)', ''],
    ['2026-01-25-2026-04-25', ''],
    HEADER_ROW,
    ...dataRows,
    ['סך הכל'],
    ['165.50₪'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

const TX1 = ['25-01-2026','מכולת לדוגמה','מזון וצריכה','1234','רגילה',120.50,'₪',120.50,'₪','02-02-2026','','','','','','']
const TX2 = ['26-01-2026','חנות פירות לדוגמה','מזון וצריכה','1234','רגילה',45,'₪',45,'₪','02-02-2026','','','','','','']

describe('parseMaxCC', () => {
  it('skips metadata, header, and footer — returns 2 transactions', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1, TX2]))
    expect(transactions).toHaveLength(2)
  })

  it('parses transaction date DD-MM-YYYY correctly', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].transactionDate).toEqual(new Date(2026, 0, 25))
  })

  it('parses billing date correctly', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].billingDate).toEqual(new Date(2026, 1, 2))
  })

  it('parses charged amount', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].chargedAmount).toBe(120.50)
  })

  it('sets cardProvider to MAX', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].cardProvider).toBe('MAX')
  })

  it('sets merchantName equal to originalMerchantName by default', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].merchantName).toBe(transactions[0].originalMerchantName)
  })

  it('captures category from column 2', () => {
    const { transactions } = parseMaxCC(buildWorkbook([TX1]))
    expect(transactions[0].category).toBe('מזון וצריכה')
  })

  it('combines both sheets when workbook has two sheets', () => {
    const wb = XLSX.utils.book_new()
    const makeSheet = (rows: unknown[][]) =>
      XLSX.utils.aoa_to_sheet([
        ['כל המשתמשים (1)', ''],
        ['כל הכרטיסים (1)', ''],
        ['2026-01-25-2026-04-25', ''],
        HEADER_ROW,
        ...rows,
        ['סך הכל'],
      ])
    XLSX.utils.book_append_sheet(wb, makeSheet([TX1]), 'Sheet1')
    XLSX.utils.book_append_sheet(wb, makeSheet([TX2]), 'Sheet2')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const { transactions } = parseMaxCC(buf)
    expect(transactions).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- lib/parsers/__tests__/max-cc.test.ts
```

Expected: FAIL — `Cannot find module '../max-cc'`

- [ ] **Step 3: Write `lib/parsers/max-cc.ts`**

```typescript
import * as XLSX from 'xlsx'
import type { ParsedCCTransaction, ParseResult } from './types'

function parseAmount(val: unknown): number {
  if (typeof val === 'number') return val
  return parseFloat(String(val ?? '0').replace(/,/g, '')) || 0
}

function parseDashedDate(val: unknown): Date {
  const str = String(val ?? '')
  const [day, month, year] = str.split('-')
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
}

function isDataRow(row: unknown[]): boolean {
  const first = String(row?.[0] ?? '')
  // Data rows start with DD-MM-YYYY
  return /^\d{2}-\d{2}-\d{4}$/.test(first)
}

function parseSheet(sheet: XLSX.WorkSheet): ParsedCCTransaction[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  // rows[0-2]: metadata, rows[3]: headers, rows[4+]: data + footer
  const colMap = buildColMap(rows[3] as string[])

  return rows.slice(4).filter(isDataRow).map(row => {
    const r = row as unknown[]
    const originalMerchantName = String(r[colMap['שם בית העסק']] ?? '').trim()
    return {
      transactionDate: parseDashedDate(r[colMap['תאריך עסקה']]),
      billingDate: parseDashedDate(r[colMap['תאריך חיוב']]),
      originalMerchantName,
      merchantName: originalMerchantName,
      category: String(r[colMap['קטגוריה']] ?? ''),
      chargedAmount: parseAmount(r[colMap['סכום חיוב']]),
      originalAmount: parseAmount(r[colMap['סכום עסקה מקורי']]),
      originalCurrency: String(r[colMap['מטבע עסקה מקורי']] ?? '₪'),
      cardLastFour: String(r[colMap['4 ספרות אחרונות של כרטיס האשראי']] ?? ''),
      transactionType: String(r[colMap['סוג עסקה']] ?? ''),
      notes: String(r[colMap['הערות']] ?? ''),
      cardProvider: 'MAX' as const,
    }
  })
}

function buildColMap(headerRow: string[]): Record<string, number> {
  return (headerRow ?? []).reduce((map, header, i) => {
    map[String(header).trim()] = i
    return map
  }, {} as Record<string, number>)
}

export function parseMaxCC(buffer: Buffer): ParseResult<ParsedCCTransaction> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const transactions: ParsedCCTransaction[] = []

  for (const sheetName of workbook.SheetNames) {
    transactions.push(...parseSheet(workbook.Sheets[sheetName]))
  }

  return { transactions, errors: [] }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- lib/parsers/__tests__/max-cc.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parsers/max-cc.ts lib/parsers/__tests__/max-cc.test.ts
git commit -m "feat: add Max CC XLSX parser with tests"
```

---

## Task 8: Database Query Layer

**Files:**
- Create: `lib/db/bank.ts`
- Create: `lib/db/cards.ts`
- Create: `lib/db/aliases.ts`
- Create: `lib/db/upload.ts`

- [ ] **Step 1: Write `lib/db/bank.ts`**

```typescript
import { prisma } from './client'
import type { ParsedBankTransaction } from '../parsers/types'

export async function upsertBankTransactions(
  transactions: ParsedBankTransaction[]
): Promise<{ created: number; skipped: number }> {
  const aliases = await prisma.transactionAlias.findMany({ where: { source: 'BANK' } })
  const aliasMap = new Map(aliases.map(a => [a.originalName, a.displayName]))

  let created = 0
  let skipped = 0

  for (const tx of transactions) {
    const existing = await prisma.bankTransaction.findFirst({
      where: {
        date: tx.date,
        originalDescription: tx.originalDescription,
        debit: tx.debit,
        credit: tx.credit,
      },
    })
    if (existing) { skipped++; continue }

    await prisma.bankTransaction.create({
      data: {
        date: tx.date,
        originalDescription: tx.originalDescription,
        description: aliasMap.get(tx.originalDescription) ?? tx.originalDescription,
        debit: tx.debit,
        credit: tx.credit,
        balance: tx.balance,
        note: tx.note,
        sourceFile: tx.sourceFile,
      },
    })
    created++
  }

  return { created, skipped }
}

export async function getBankTransactions(params: {
  month?: number
  year?: number
  search?: string
}) {
  const where: Parameters<typeof prisma.bankTransaction.findMany>[0]['where'] = {}

  if (params.year) {
    const m = params.month
    where.date = {
      gte: new Date(params.year, m ? m - 1 : 0, 1),
      lte: m
        ? new Date(params.year, m, 0, 23, 59, 59)
        : new Date(params.year, 12, 0, 23, 59, 59),
    }
  }

  if (params.search) {
    where.description = { contains: params.search }
  }

  return prisma.bankTransaction.findMany({ where, orderBy: { date: 'desc' } })
}

export async function updateBankTransaction(
  id: string,
  data: { description?: string; note?: string }
) {
  return prisma.bankTransaction.update({ where: { id }, data })
}

export async function getBankMonthlySummary(year: number) {
  const txs = await prisma.bankTransaction.findMany({
    where: {
      date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) },
    },
  })

  const monthly: Record<number, { income: number; expense: number }> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = { income: 0, expense: 0 }

  for (const tx of txs) {
    const m = tx.date.getMonth() + 1
    monthly[m].income += tx.credit
    monthly[m].expense += tx.debit
  }

  return monthly
}
```

- [ ] **Step 2: Write `lib/db/cards.ts`**

```typescript
import { prisma } from './client'
import type { ParsedCCTransaction } from '../parsers/types'
import type { CardProvider } from '@prisma/client'

export async function upsertCCTransactions(
  transactions: ParsedCCTransaction[]
): Promise<{ created: number; skipped: number }> {
  const provider = transactions[0]?.cardProvider ?? 'MAX'
  const source = provider === 'MAX' ? 'MAX' : 'HITECH'

  const aliases = await prisma.transactionAlias.findMany({ where: { source } })
  const aliasMap = new Map(aliases.map(a => [a.originalName, a.displayName]))

  let created = 0
  let skipped = 0

  for (const tx of transactions) {
    const existing = await prisma.creditCardTransaction.findFirst({
      where: {
        transactionDate: tx.transactionDate,
        originalMerchantName: tx.originalMerchantName,
        chargedAmount: tx.chargedAmount,
        cardProvider: tx.cardProvider as CardProvider,
      },
    })
    if (existing) { skipped++; continue }

    await prisma.creditCardTransaction.create({
      data: {
        transactionDate: tx.transactionDate,
        billingDate: tx.billingDate,
        originalMerchantName: tx.originalMerchantName,
        merchantName: aliasMap.get(tx.originalMerchantName) ?? tx.originalMerchantName,
        category: tx.category,
        chargedAmount: tx.chargedAmount,
        originalAmount: tx.originalAmount,
        originalCurrency: tx.originalCurrency,
        cardLastFour: tx.cardLastFour,
        transactionType: tx.transactionType,
        notes: tx.notes,
        cardProvider: tx.cardProvider as CardProvider,
      },
    })
    created++
  }

  return { created, skipped }
}

export async function getCCTransactions(params: {
  provider: CardProvider
  month?: number
  year?: number
  search?: string
}) {
  const where: Parameters<typeof prisma.creditCardTransaction.findMany>[0]['where'] = {
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

  if (params.search) {
    where.merchantName = { contains: params.search }
  }

  return prisma.creditCardTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
  })
}

export async function updateCCTransaction(
  id: string,
  data: { merchantName?: string; category?: string; categoryOverride?: string }
) {
  return prisma.creditCardTransaction.update({ where: { id }, data })
}

export async function getCCCategorySummary(provider: CardProvider, year: number, month?: number) {
  const m = month
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      transactionDate: {
        gte: new Date(year, m ? m - 1 : 0, 1),
        lte: m
          ? new Date(year, m, 0, 23, 59, 59)
          : new Date(year, 11, 31, 23, 59, 59),
      },
    },
  })

  const byCategory: Record<string, number> = {}
  for (const tx of txs) {
    const cat = tx.categoryOverride ?? tx.category
    byCategory[cat] = (byCategory[cat] ?? 0) + tx.chargedAmount
  }

  return byCategory
}

export async function getCCMonthlySummary(provider: CardProvider, year: number) {
  const txs = await prisma.creditCardTransaction.findMany({
    where: {
      cardProvider: provider,
      transactionDate: {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      },
    },
  })

  const monthly: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) monthly[m] = 0

  for (const tx of txs) {
    const m = tx.transactionDate.getMonth() + 1
    monthly[m] += tx.chargedAmount
  }

  return monthly
}
```

- [ ] **Step 3: Write `lib/db/aliases.ts`**

```typescript
import { prisma } from './client'
import type { AliasSource } from '@prisma/client'

export async function getAliases(source?: AliasSource) {
  return prisma.transactionAlias.findMany({
    where: source ? { source } : undefined,
    orderBy: { originalName: 'asc' },
  })
}

export async function upsertAlias(params: {
  source: AliasSource
  originalName: string
  displayName: string
  categoryOverride?: string
}) {
  return prisma.transactionAlias.upsert({
    where: { source_originalName: { source: params.source, originalName: params.originalName } },
    update: { displayName: params.displayName, categoryOverride: params.categoryOverride },
    create: params,
  })
}
```

- [ ] **Step 4: Write `lib/db/upload.ts`**

```typescript
import { prisma } from './client'
import type { AliasSource } from '@prisma/client'

export async function recordUpload(params: {
  fileName: string
  recordCount: number
  source: AliasSource
}) {
  return prisma.uploadHistory.create({ data: params })
}

export async function getUploadHistory() {
  return prisma.uploadHistory.findMany({ orderBy: { uploadedAt: 'desc' } })
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/bank.ts lib/db/cards.ts lib/db/aliases.ts lib/db/upload.ts
git commit -m "feat: add database query layer for bank, cards, aliases, and uploads"
```

---

## Task 9: API Routes

**Files:**
- Create: `app/api/upload/route.ts`
- Create: `app/api/upload/history/route.ts`
- Create: `app/api/bank/transactions/route.ts`
- Create: `app/api/bank/transactions/[id]/route.ts`
- Create: `app/api/cards/max/transactions/route.ts`
- Create: `app/api/cards/max/transactions/[id]/route.ts`
- Create: `app/api/summary/route.ts`
- Create: `app/api/aliases/route.ts`

- [ ] **Step 1: Write `app/api/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { recordUpload } from '@/lib/db/upload'

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get('file') as File | null
  const source = form.get('source') as string | null

  if (!file || !source) {
    return NextResponse.json({ error: 'חסר קובץ או סוג מקור' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  if (source === 'BANK') {
    const { transactions, errors } = parseBankLeumi(buffer, file.name)
    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 422 })

    const result = await upsertBankTransactions(transactions)
    await recordUpload({ fileName: file.name, recordCount: result.created, source: 'BANK' })
    return NextResponse.json(result)
  }

  if (source === 'MAX') {
    const { transactions, errors } = parseMaxCC(buffer)
    if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 422 })

    const result = await upsertCCTransactions(transactions)
    await recordUpload({ fileName: file.name, recordCount: result.created, source: 'MAX' })
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'מקור לא מוכר' }, { status: 400 })
}
```

- [ ] **Step 2: Write `app/api/upload/history/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getUploadHistory } from '@/lib/db/upload'

export async function GET() {
  const history = await getUploadHistory()
  return NextResponse.json(history)
}
```

- [ ] **Step 3: Write `app/api/bank/transactions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getBankTransactions } from '@/lib/db/bank'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined

  const transactions = await getBankTransactions({ year, month, search })
  return NextResponse.json(transactions)
}
```

- [ ] **Step 4: Write `app/api/bank/transactions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { updateBankTransaction } from '@/lib/db/bank'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const updated = await updateBankTransaction(id, {
    description: body.description,
    note: body.note,
  })
  return NextResponse.json(updated)
}
```

- [ ] **Step 5: Write `app/api/cards/max/transactions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getCCTransactions } from '@/lib/db/cards'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = sp.get('year') ? Number(sp.get('year')) : undefined
  const month = sp.get('month') ? Number(sp.get('month')) : undefined
  const search = sp.get('search') ?? undefined

  const transactions = await getCCTransactions({ provider: 'MAX', year, month, search })
  return NextResponse.json(transactions)
}
```

- [ ] **Step 6: Write `app/api/cards/max/transactions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { updateCCTransaction } from '@/lib/db/cards'
import { upsertAlias } from '@/lib/db/aliases'
import { prisma } from '@/lib/db/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const updated = await updateCCTransaction(id, {
    merchantName: body.merchantName,
    categoryOverride: body.categoryOverride,
  })

  // Persist alias so future uploads apply the correction automatically
  if (body.merchantName) {
    const tx = await prisma.creditCardTransaction.findUnique({ where: { id } })
    if (tx) {
      await upsertAlias({
        source: 'MAX',
        originalName: tx.originalMerchantName,
        displayName: body.merchantName,
        categoryOverride: body.categoryOverride,
      })
    }
  }

  return NextResponse.json(updated)
}
```

- [ ] **Step 7: Write `app/api/summary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getBankMonthlySummary } from '@/lib/db/bank'
import { getCCMonthlySummary } from '@/lib/db/cards'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const year = Number(sp.get('year') ?? new Date().getFullYear())

  const [bank, max] = await Promise.all([
    getBankMonthlySummary(year),
    getCCMonthlySummary('MAX', year),
  ])

  return NextResponse.json({ bank, max })
}
```

- [ ] **Step 8: Write `app/api/aliases/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAliases, upsertAlias } from '@/lib/db/aliases'
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
```

- [ ] **Step 9: Commit**

```bash
git add app/api/
git commit -m "feat: add all API routes for upload, bank, cards, summary, and aliases"
```

---

## Task 10: Utility Helpers

**Files:**
- Create: `lib/utils/date.ts`
- Create: `lib/utils/currency.ts`
- Create: `hooks/use-period.ts`

- [ ] **Step 1: Write `lib/utils/date.ts`**

```typescript
const MONTHS_HE = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
]

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function monthName(month: number): string {
  return MONTHS_HE[month - 1] ?? ''
}

export function monthsArray(): { value: number; label: string }[] {
  return MONTHS_HE.map((label, i) => ({ value: i + 1, label }))
}
```

- [ ] **Step 2: Write `lib/utils/currency.ts`**

```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2 }).format(amount)
}
```

- [ ] **Step 3: Write `hooks/use-period.ts`**

```typescript
'use client'

import { useSearchParams } from 'next/navigation'

export function usePeriod() {
  const params = useSearchParams()
  const now = new Date()
  const year = Number(params.get('year') ?? now.getFullYear())
  const month = Number(params.get('month') ?? now.getMonth() + 1)
  return { year, month }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/utils/ hooks/
git commit -m "feat: add date/currency utils and usePeriod hook"
```

---

## Task 11: Upload Page

**Files:**
- Create: `components/upload/upload-zone.tsx`
- Create: `components/upload/upload-history-table.tsx`
- Create: `app/upload/page.tsx`

- [ ] **Step 1: Write `components/upload/upload-zone.tsx`**

```typescript
'use client'

import { useState, useRef } from 'react'

const SOURCES = [
  { value: 'BANK', label: 'בנק לאומי' },
  { value: 'MAX', label: 'מקס כרטיס אשראי' },
]

interface UploadResult {
  created: number
  skipped: number
}

export function UploadZone({ onSuccess }: { onSuccess: () => void }) {
  const [source, setSource] = useState('BANK')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setLoading(true)
    setResult(null)
    setError(null)

    const form = new FormData()
    form.append('file', file)
    form.append('source', source)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'שגיאה בהעלאה'); return }
      setResult(data)
      onSuccess()
    } catch {
      setError('שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) upload(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {SOURCES.map(s => (
          <button
            key={s.value}
            onClick={() => setSource(s.value)}
            className={`px-4 py-2 rounded-md text-sm border transition-colors ${
              source === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent border-border'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <p className="text-muted-foreground text-sm">
          גרור קובץ לכאן או לחץ לבחירה
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {source === 'BANK' ? '.xls — בנק לאומי' : '.xlsx — מקס'}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xls,.xlsx"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">מעלה...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="text-sm p-3 rounded-md bg-accent">
          <span className="text-primary font-medium">{result.created} עסקאות חדשות</span>
          {result.skipped > 0 && (
            <span className="text-muted-foreground"> · {result.skipped} כפולות דולגו</span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `components/upload/upload-history-table.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { formatDate } from '@/lib/utils/date'

interface UploadRecord {
  id: string
  fileName: string
  uploadedAt: string
  recordCount: number
  source: string
}

const SOURCE_LABELS: Record<string, string> = {
  BANK: 'בנק לאומי',
  MAX: 'מקס',
  HITECH: 'הייטקזון',
}

export function UploadHistoryTable({ refresh }: { refresh: number }) {
  const [history, setHistory] = useState<UploadRecord[]>([])

  useEffect(() => {
    fetch('/api/upload/history')
      .then(r => r.json())
      .then(setHistory)
  }, [refresh])

  if (!history.length) {
    return <p className="text-sm text-muted-foreground">לא הועלו קבצים עדיין</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-right py-2 px-3 font-medium">קובץ</th>
            <th className="text-right py-2 px-3 font-medium">מקור</th>
            <th className="text-right py-2 px-3 font-medium">תאריך</th>
            <th className="text-right py-2 px-3 font-medium">עסקאות</th>
          </tr>
        </thead>
        <tbody>
          {history.map(row => (
            <tr key={row.id} className="border-b hover:bg-accent/50">
              <td className="py-2 px-3 max-w-[200px] truncate">{row.fileName}</td>
              <td className="py-2 px-3">{SOURCE_LABELS[row.source] ?? row.source}</td>
              <td className="py-2 px-3">{formatDate(row.uploadedAt)}</td>
              <td className="py-2 px-3">{row.recordCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/upload/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { UploadZone } from '@/components/upload/upload-zone'
import { UploadHistoryTable } from '@/components/upload/upload-history-table'

export default function UploadPage() {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">העלאת קבצים</h1>
        <p className="text-muted-foreground text-sm">העלה קובץ ייצוא מהבנק או כרטיס האשראי</p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <UploadZone onSuccess={() => setRefresh(r => r + 1)} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold mb-4">היסטוריית העלאות</h2>
        <UploadHistoryTable refresh={refresh} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/upload/ components/upload/
git commit -m "feat: add upload page with drag-and-drop zone and history table"
```

---

## Task 12: Bank Page

**Files:**
- Create: `components/bank/bank-summary-cards.tsx`
- Create: `components/bank/income-expense-chart.tsx`
- Create: `components/bank/balance-chart.tsx`
- Create: `components/bank/transactions-table.tsx`
- Create: `app/bank/page.tsx`

- [ ] **Step 1: Write `components/bank/bank-summary-cards.tsx`**

```typescript
import { formatCurrency } from '@/lib/utils/currency'

interface Props {
  income: number
  expense: number
}

export function BankSummaryCards({ income, expense }: Props) {
  const net = income - expense
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[
        { label: 'סה״כ הכנסות', value: income, color: 'text-green-600 dark:text-green-400' },
        { label: 'סה״כ הוצאות', value: expense, color: 'text-red-600 dark:text-red-400' },
        { label: 'מאזן נטו', value: net, color: net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
      ].map(card => (
        <div key={card.label} className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{formatCurrency(card.value)}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write `components/bank/income-expense-chart.tsx`**

```typescript
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface MonthData { month: number; income: number; expense: number }

export function IncomeExpenseChart({ data }: { data: MonthData[] }) {
  const chartData = data.map(d => ({
    name: monthName(d.month),
    הכנסות: d.income,
    הוצאות: d.expense,
  }))

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">הכנסות מול הוצאות</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend />
          <Bar dataKey="הכנסות" fill="#22c55e" radius={[3, 3, 0, 0]} />
          <Bar dataKey="הוצאות" fill="#ef4444" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Write `components/bank/balance-chart.tsx`**

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
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Line type="monotone" dataKey="יתרה" stroke="#22c55e" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Write `components/bank/transactions-table.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

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
  const [transactions, setTransactions] = useState(initial)
  const [editing, setEditing] = useState<{ id: string; field: 'description' | 'note'; value: string } | null>(null)

  async function saveEdit() {
    if (!editing) return
    const tx = transactions.find(t => t.id === editing.id)
    if (!tx) return

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

  return (
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
                  {editing?.id === tx.id && editing.field === 'description' ? (
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
                      className="cursor-pointer hover:text-primary"
                      onClick={() => setEditing({ id: tx.id, field: 'description', value: tx.description })}
                    >
                      {tx.description}
                    </span>
                  )}
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
  )
}
```

- [ ] **Step 5: Write `app/bank/page.tsx`**

```typescript
import { BankSummaryCards } from '@/components/bank/bank-summary-cards'
import { IncomeExpenseChart } from '@/components/bank/income-expense-chart'
import { BalanceChart } from '@/components/bank/balance-chart'
import { BankTransactionsTable } from '@/components/bank/transactions-table'

interface SearchParams { year?: string; month?: string; search?: string }

async function getBankData(params: SearchParams) {
  const sp = new URLSearchParams()
  if (params.year) sp.set('year', params.year)
  if (params.month) sp.set('month', params.month)
  if (params.search) sp.set('search', params.search)

  const base = 'http://localhost:3000'
  const [txRes, summaryRes] = await Promise.all([
    fetch(`${base}/api/bank/transactions?${sp}`, { cache: 'no-store' }),
    fetch(`${base}/api/summary?year=${params.year ?? new Date().getFullYear()}`, { cache: 'no-store' }),
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

  const year = Number(params.year ?? new Date().getFullYear())
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
        <IncomeExpenseChart data={chartData} />
        <BalanceChart data={balancePoints} />
      </div>
      <BankTransactionsTable transactions={transactions} />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/bank/ components/bank/
git commit -m "feat: add Bank Leumi page with charts and editable transaction table"
```

---

## Task 13: Max Credit Card Page

**Files:**
- Create: `components/cards/max/max-summary-cards.tsx`
- Create: `components/cards/max/category-donut.tsx`
- Create: `components/cards/max/monthly-spending-chart.tsx`
- Create: `components/cards/max/max-transactions-table.tsx`
- Create: `app/cards/max/page.tsx`

- [ ] **Step 1: Write `components/cards/max/max-summary-cards.tsx`**

```typescript
import { formatCurrency } from '@/lib/utils/currency'

interface Props { total: number; count: number }

export function MaxSummaryCards({ total, count }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">סה״כ חיובים</p>
        <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{formatCurrency(total)}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">מספר עסקאות</p>
        <p className="text-2xl font-bold mt-1">{count}</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/cards/max/category-donut.tsx`**

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
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Write `components/cards/max/monthly-spending-chart.tsx`**

```typescript
'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { monthName } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface Props { data: Record<number, number> }

export function MonthlySpendingChart({ data }: Props) {
  const chartData = Object.entries(data).map(([m, total]) => ({
    name: monthName(Number(m)),
    הוצאות: total,
  }))

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-4">הוצאות חודשיות</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₪${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Bar dataKey="הוצאות" fill="#ef4444" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Write `components/cards/max/max-transactions-table.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { formatDate } from '@/lib/utils/date'
import { formatCurrency } from '@/lib/utils/currency'

interface CCTx {
  id: string
  transactionDate: string
  billingDate: string
  merchantName: string
  category: string
  categoryOverride: string | null
  chargedAmount: number
  originalAmount: number
  originalCurrency: string
}

export function MaxTransactionsTable({ transactions: initial }: { transactions: CCTx[] }) {
  const [transactions, setTransactions] = useState(initial)
  const [editing, setEditing] = useState<{ id: string; field: 'merchantName' | 'category'; value: string } | null>(null)

  async function saveEdit() {
    if (!editing) return
    const payload =
      editing.field === 'merchantName'
        ? { merchantName: editing.value }
        : { categoryOverride: editing.value }

    await fetch(`/api/cards/max/transactions/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setTransactions(prev =>
      prev.map(t =>
        t.id === editing.id
          ? { ...t, [editing.field === 'merchantName' ? 'merchantName' : 'categoryOverride']: editing.value }
          : t
      )
    )
    setEditing(null)
  }

  return (
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
                  {editing?.id === tx.id && editing.field === 'merchantName' ? (
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
                      className="cursor-pointer hover:text-primary"
                      onClick={() => setEditing({ id: tx.id, field: 'merchantName', value: tx.merchantName })}
                    >
                      {tx.merchantName}
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 min-w-[120px]">
                  {editing?.id === tx.id && editing.field === 'category' ? (
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
                      className="cursor-pointer hover:text-primary"
                      onClick={() => setEditing({ id: tx.id, field: 'category', value: tx.categoryOverride ?? tx.category })}
                    >
                      {tx.categoryOverride ?? tx.category}
                    </span>
                  )}
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
  )
}
```

- [ ] **Step 5: Write `app/cards/max/page.tsx`**

```typescript
import { MaxSummaryCards } from '@/components/cards/max/max-summary-cards'
import { CategoryDonut } from '@/components/cards/max/category-donut'
import { MonthlySpendingChart } from '@/components/cards/max/monthly-spending-chart'
import { MaxTransactionsTable } from '@/components/cards/max/max-transactions-table'

interface SearchParams { year?: string; month?: string; search?: string }

async function getMaxData(params: SearchParams) {
  const sp = new URLSearchParams()
  if (params.year) sp.set('year', params.year)
  if (params.month) sp.set('month', params.month)
  if (params.search) sp.set('search', params.search)

  const year = params.year ?? String(new Date().getFullYear())
  const month = params.month ?? String(new Date().getMonth() + 1)
  const base = 'http://localhost:3000'

  const [txRes, summaryRes, catRes] = await Promise.all([
    fetch(`${base}/api/cards/max/transactions?${sp}`, { cache: 'no-store' }),
    fetch(`${base}/api/summary?year=${year}`, { cache: 'no-store' }),
    fetch(`${base}/api/cards/max/transactions?year=${year}&month=${month}`, { cache: 'no-store' }),
  ])

  const transactions = await txRes.json()
  const summary = await summaryRes.json()
  const monthlyTxs = await catRes.json()

  const categoryTotals: Record<string, number> = {}
  for (const tx of monthlyTxs) {
    const cat = tx.categoryOverride ?? tx.category
    categoryTotals[cat] = (categoryTotals[cat] ?? 0) + tx.chargedAmount
  }

  return { transactions, maxSummary: summary.max, categoryTotals }
}

export default async function MaxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const { transactions, maxSummary, categoryTotals } = await getMaxData(params)

  const total = transactions.reduce((s: number, t: { chargedAmount: number }) => s + t.chargedAmount, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">מקס כרטיס אשראי</h1>
      <MaxSummaryCards total={total} count={transactions.length} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryDonut data={categoryTotals} />
        <MonthlySpendingChart data={maxSummary} />
      </div>
      <MaxTransactionsTable transactions={transactions} />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/cards/ components/cards/
git commit -m "feat: add Max credit card page with category donut and transaction table"
```

---

## Task 14: Dashboard Page

**Files:**
- Create: `components/dashboard/summary-cards.tsx`
- Create: `components/dashboard/combined-chart.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Write `components/dashboard/summary-cards.tsx`**

```typescript
import { formatCurrency } from '@/lib/utils/currency'

interface Props {
  bankIncome: number
  bankExpense: number
  ccTotal: number
}

export function DashboardSummaryCards({ bankIncome, bankExpense, ccTotal }: Props) {
  const net = bankIncome - bankExpense - ccTotal
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[
        { label: 'הכנסות (בנק)', value: bankIncome, color: 'text-green-600 dark:text-green-400' },
        { label: 'הוצאות (בנק)', value: bankExpense, color: 'text-red-600 dark:text-red-400' },
        { label: 'חיובי כרטיס', value: ccTotal, color: 'text-orange-600 dark:text-orange-400' },
        { label: 'מאזן נטו', value: net, color: net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
      ].map(card => (
        <div key={card.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className={`text-xl font-bold mt-1 ${card.color}`}>{formatCurrency(card.value)}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write `components/dashboard/combined-chart.tsx`**

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
      <ResponsiveContainer width="100%" height={300}>
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
  )
}
```

- [ ] **Step 3: Write `app/page.tsx`**

```typescript
import { DashboardSummaryCards } from '@/components/dashboard/summary-cards'
import { CombinedChart } from '@/components/dashboard/combined-chart'

interface SearchParams { year?: string; month?: string }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const year = params.year ?? String(new Date().getFullYear())
  const month = Number(params.month ?? new Date().getMonth() + 1)

  const res = await fetch(`http://localhost:3000/api/summary?year=${year}`, {
    cache: 'no-store',
  })
  const { bank, max } = await res.json()

  const bankMonth = bank[month] ?? { income: 0, expense: 0 }
  const maxMonth = max[month] ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">לוח בקרה</h1>
      <DashboardSummaryCards
        bankIncome={bankMonth.income}
        bankExpense={bankMonth.expense}
        ccTotal={maxMonth}
      />
      <CombinedChart bankSummary={bank} maxSummary={max} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/dashboard/
git commit -m "feat: add dashboard page with combined monthly chart and summary cards"
```

---

## Task 15: Final Wiring + Smoke Test

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/jordanyefetberman/Git/Personal/Tazrim
npm test
```

Expected: All parser tests PASS.

- [ ] **Step 2: Build the app**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Start the app and verify it loads**

```bash
npm run dev
```

Open `http://localhost:3000` in a browser. Expected: Dashboard renders with Hebrew RTL layout and sidebar.

- [ ] **Step 4: Upload a test file**

Navigate to `http://localhost:3000/upload`. Select **בנק לאומי**, drag the actual Bank Leumi `.xls` file, verify the result shows "X עסקאות חדשות".

- [ ] **Step 5: Verify Bank page**

Navigate to `/bank`. Expected: Summary cards show real numbers, charts render.

- [ ] **Step 6: Upload Max CC file and verify Max page**

Upload `transaction-details_export_*.xlsx` with **מקס** selected, then navigate to `/cards/max`. Expected: Category donut and monthly bar chart render.

- [ ] **Step 7: Test dark mode**

Click the moon icon in the header. Expected: App switches to dark theme cleanly.

- [ ] **Step 8: Test inline editing**

On the Bank page, click a description. Type a new name, press Enter. Reload the page. Expected: The new name persists.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: complete Tazrim v1 — finance dashboard with Bank Leumi and Max CC"
```
