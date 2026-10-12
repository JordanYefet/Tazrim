# Tazrim — Design Spec
_Date: 2026-04-25_

## Overview

Tazrim (תזרים) is a personal finance dashboard for home use. It parses exported bank and credit card files, stores transactions locally, and presents monthly/yearly income, expenses, and balance breakdowns with charts. It runs on a local home server accessible over WiFi. No cloud, no internet dependency.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | TailwindCSS |
| Component library | shadcn/ui |
| Charts | Recharts |
| Database | SQLite via Prisma |
| Language | TypeScript |
| i18n / RTL | Hebrew, `dir="rtl"` on root, Tailwind `rtl:` variants |
| Theme | Light/dark mode via shadcn/ui + `next-themes` |

**Runtime**: `next start` bound to `0.0.0.0:3000` — accessible on local WiFi from any device.

---

## Data Sources (v1 scope)

| Source | File Format | Parser notes |
|---|---|---|
| Bank Leumi | `.xls` (actually UTF-8 HTML) | Skip first table (balance summary), parse table 2, skip first 2 rows (title + headers already handled), strip footer rows |
| Max credit card | `.xlsx` (real OOXML) | 3 metadata rows before header row, 2 sheets (domestic + international) — combine both, strip footer total row |

**Out of scope for v1**: HitechZone credit card, self-directed trading account, managed trading account, pension funds.

**Bank Leumi columns**: `תאריך` (DD/MM/YYYY), `תיאור`, `בחובה`, `בזכות`, `היתרה בש"ח`, `הערה`

**Max columns**: `תאריך עסקה` (DD-MM-YYYY), `שם בית העסק`, `קטגוריה`, `4 ספרות אחרונות`, `סוג עסקה`, `סכום חיוב`, `מטבע חיוב`, `סכום עסקה מקורי`, `מטבע עסקה מקורי`, `תאריך חיוב`, `הערות`, `תיוגים`, `מועדון הנחות`, `מפתח דיסקונט`, `אופן ביצוע ההעסקה`, `שער המרה`

---

## Database Schema (SQLite + Prisma)

### BankTransaction
```prisma
model BankTransaction {
  id                  String   @id @default(uuid())
  date                DateTime
  originalDescription String
  description         String   // editable, defaults to originalDescription
  debit               Float    @default(0)
  credit              Float    @default(0)
  balance             Float
  note                String?
  sourceFile          String

  @@unique([date, originalDescription, debit, credit])
}
```

### CreditCardTransaction
```prisma
model CreditCardTransaction {
  id                   String      @id @default(uuid())
  transactionDate      DateTime
  billingDate          DateTime
  originalMerchantName String
  merchantName         String      // editable, auto-resolved via MerchantAlias
  category             String
  categoryOverride     String?
  chargedAmount        Float
  originalAmount       Float
  originalCurrency     String
  cardLastFour         String
  transactionType      String
  notes                String?
  cardProvider         CardProvider

  @@unique([transactionDate, originalMerchantName, chargedAmount, cardProvider])
}

enum CardProvider {
  MAX
  HITECH
}
```

### TransactionAlias
```prisma
model TransactionAlias {
  id               String      @id @default(uuid())
  source           AliasSource
  originalName     String
  displayName      String
  categoryOverride String?

  @@unique([source, originalName])
}

enum AliasSource {
  BANK
  MAX
  HITECH
}
```

### UploadHistory
```prisma
model UploadHistory {
  id          String      @id @default(uuid())
  fileName    String
  uploadedAt  DateTime    @default(now())
  recordCount Int
  source      AliasSource
}
```

---

## Deduplication

- **Bank**: unique constraint on `(date, originalDescription, debit, credit)`
- **Max**: unique constraint on `(transactionDate, originalMerchantName, chargedAmount, cardProvider)`
- On upload, rows that violate the unique constraint are silently skipped (upsert behavior). The UI shows how many were new vs skipped.

---

## Merchant / Description Alias System

1. On upload, each row's raw name is looked up in `TransactionAlias`
2. If a match exists → `displayName` is applied automatically
3. If no match → raw name is used as the default display name
4. User edits a name inline in the transaction table → saved to `TransactionAlias`
5. Future uploads containing the same raw name get the correction applied automatically

---

## Pages & Routing

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Summary cards + combined monthly bar chart across all sources |
| `/bank` | Bank Leumi | Income/expense bar chart, balance line chart, transaction table |
| `/cards/max` | Max | Category donut chart, monthly bar chart, transaction table |
| `/upload` | העלאת קבצים | Drag-and-drop upload, upload history log |

---

## UI Structure

**Layout**: Sidebar (desktop) / bottom navigation bar (mobile). Hebrew RTL throughout.

**Month/Year selector**: Global, persistent in header — all charts and tables reflect the selected period.

### Dashboard `/`
- 3 summary cards: סה״כ הכנסות / סה״כ הוצאות / מאזן נטו
- Combined monthly bar chart: Bank + Max totals side by side per month
- Period selector: monthly / yearly toggle

### Bank `/bank`
- Summary cards: הכנסות, הוצאות, מאזן
- Bar chart: monthly income vs expenses (toggle to yearly)
- Line chart: running balance over time
- Transaction table: date, description (inline editable), debit, credit, balance, note

### Max `/cards/max`
- Summary cards: סה״כ חיובים, מספר עסקאות
- Donut chart: spending by category
- Bar chart: monthly spending total
- Transaction table: date, merchant (inline editable), category (editable), amount, billing date

### Upload `/upload`
- Drag-and-drop zone with source selector (Bank Leumi / Max)
- Upload result: X new transactions imported, Y duplicates skipped
- Upload history table: file name, source, date, record count

---

## Charts (Recharts)

| Chart | Page | Type |
|---|---|---|
| Monthly income vs expenses | Bank, Dashboard | Bar (grouped) |
| Yearly income vs expenses | Bank | Bar (grouped) |
| Running balance | Bank | Line |
| Monthly spending | Max | Bar |
| Spending by category | Max | Donut |
| Combined monthly | Dashboard | Bar (grouped, stacked by source) |

---

## File Parsers

Both parsers live in `lib/parsers/`. They receive a `Buffer` from the file upload API route and return a typed array of transaction objects.

**`parseBankLeumi(buffer: Buffer): BankTransaction[]`**
- Detects UTF-8 HTML, extracts table 2
- Skips first 2 rows (title + header), strips empty/footer rows
- Parses date as DD/MM/YYYY → `Date`
- Strips commas from numeric strings → `parseFloat`

**`parseMaxCC(buffer: Buffer): CreditCardTransaction[]`**
- Reads OOXML (xlsx library)
- Processes both Sheet 1 (domestic) and Sheet 2 (international)
- Row 0–2 are metadata (user, card, date range) — skipped
- Row 3 is the header row — used for column detection
- Row 4+ are data rows; strips trailing footer rows (סך הכל + total amount)
- Parses `תאריך עסקה` as DD-MM-YYYY → `Date`
- Sets `cardProvider = MAX`

---

## API Routes (Next.js App Router)

| Method | Route | Description |
|---|---|---|
| POST | `/api/upload` | Accepts multipart file, detects source, runs parser, upserts to DB |
| GET | `/api/bank/transactions` | Returns bank transactions with filters (month, year, search) |
| PATCH | `/api/bank/transactions/:id` | Update description or note |
| GET | `/api/cards/max/transactions` | Returns Max transactions with filters |
| PATCH | `/api/cards/max/transactions/:id` | Update merchantName or category |
| GET | `/api/summary` | Returns aggregated monthly/yearly totals for all sources |
| GET | `/api/upload/history` | Returns upload history |
| GET | `/api/aliases` | Returns all aliases |
| POST | `/api/aliases` | Create or update an alias |

---

## Light/Dark Mode

- `next-themes` with `ThemeProvider` wrapping the app
- shadcn/ui components use CSS variables — dark mode works out of the box
- Toggle button in the top navigation bar

---

## RTL / Hebrew

- `<html dir="rtl" lang="he">` in root layout
- Tailwind `rtl:` variants for any layout that needs directional adjustment
- All UI text in Hebrew
- Recharts tooltips and labels in Hebrew

---

## Extensibility Notes

- `CardProvider` and `AliasSource` enums are the only places to update when adding HitechZone or other sources
- Each new source gets its own parser in `lib/parsers/`
- New page routes follow the same pattern as `/cards/max`
- The `TransactionAlias` table is source-agnostic by design

---

## Out of Scope (v1)

- Authentication / user accounts (single household, no auth needed)
- Cloud deployment
- HitechZone credit card
- Trading accounts (self-directed, managed)
- Pension funds
- Export / report generation
- Budget targets or alerts
- Mobile app
