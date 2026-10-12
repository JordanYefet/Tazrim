# Tazrim Improvements Design

**Date:** 2026-04-26  
**Scope:** Four targeted improvements to the Tazrim finance dashboard.

---

## Issue 1: Bank Leumi Parser Fix

### Problem
The parser hardcodes `tables[1]` and skips exactly 2 rows (title + header). The actual Bank Leumi XLS file has a different structure, resulting in 0 transactions parsed despite no error.

### Solution
Scan all tables in the HTML document. Find the table that contains a header row whose first cell matches `תאריך` (date column). The rows after that header row are the data rows. This makes the parser structure-agnostic regardless of how many tables or title rows precede the data.

### Changes
- `lib/parsers/bank-leumi.ts`: Replace `tables[1]` lookup with a dynamic scan. Iterate tables, then rows, find the row where `cells[0]` is `"תאריך"`, collect all subsequent rows as data rows.

---

## Issue 2: Category System

### Overview
Replace free-text category editing with a user-managed enum system. Categories are stored in the DB. Changing a merchant's category updates all records with that merchant and persists an alias for future uploads. A dedicated `/categories` page manages both the category list and merchant mappings.

### Data Model

**New model: `Category`**
```prisma
model Category {
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now())
}
```

One Prisma migration to add this table.

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/categories` | List all categories (sorted by name) |
| POST | `/api/categories` | Create new category `{ name }` |
| PATCH | `/api/categories/[id]` | Rename category `{ name }` |
| DELETE | `/api/categories/[id]` | Delete category |

Existing `/api/aliases` route remains unchanged (used for merchant name overrides).

### CC Transactions Table Changes

- Category column: replaces the free-text inline edit with a `<select>` dropdown populated from all `Category` records.
- Saving a category change does **three things in one PATCH**:
  1. Updates `categoryOverride` on the current record.
  2. Bulk-updates `categoryOverride` on all `CreditCardTransaction` records sharing the same `originalMerchantName`.
  3. Upserts a `TransactionAlias` so future uploads for that merchant inherit the category.
- The existing `PATCH /api/cards/max/transactions/[id]` route is extended to accept `categoryOverride` and perform the bulk update.

### Merchant Click Filter (Bank + CC)

Clicking a merchant/description name in the transactions table adds `?merchant=<encodedName>` to the URL. This navigates to the same page but with an active merchant filter.

- `GET /api/bank/transactions` and `GET /api/cards/max/transactions` each accept a new `merchant` query param for exact-match filtering (case-sensitive match on `description` / `merchantName`).
- A dismissible filter chip appears above the table when a merchant filter is active, showing the merchant name and an ✕ to clear.
- The merchant name cells are styled `cursor-pointer hover:underline` to signal clickability.

### Categories Management Page (`/categories`)

New page with two sections:

**Section 1 — Categories list**
- Displays all `Category` records.
- Inline add: text input + "הוסף" button creates a new category.
- Each row: category name (editable inline on click) + delete button (disabled if any alias uses it).

**Section 2 — Merchant mappings**
- Displays all `TransactionAlias` records grouped by `source` (BANK / MAX).
- Columns: original name | display name | category (dropdown) | source.
- Inline editing for display name and category dropdown.
- Saving a category change here calls `PATCH /api/aliases` with `{ source, originalName, categoryOverride }`. That route performs the alias upsert **and** bulk-updates `categoryOverride` on all matching `CreditCardTransaction` records (same `originalMerchantName`).

**Sidebar nav** gets a new entry: `קטגוריות` (Categories) with a `Tag` icon, linking to `/categories`.

---

## Issue 3: Responsive Charts

### Problem
All charts use fixed pixel heights (e.g. `height={280}`). On narrow/vertical screens the `ResponsiveContainer` clips the chart instead of shrinking gracefully.

### Solution
Wrap each `ResponsiveContainer` in a `div` with Tailwind responsive height classes:

```tsx
<div className="h-48 sm:h-64 md:h-72">
  <ResponsiveContainer width="100%" height="100%">
    ...
  </ResponsiveContainer>
</div>
```

Remove the `height` prop from all `ResponsiveContainer` usages and replace with `height="100%"`.

### Files affected
- `components/bank/income-expense-chart.tsx`
- `components/bank/balance-chart.tsx`
- `components/cards/max/category-donut.tsx`
- `components/cards/max/monthly-spending-chart.tsx`
- `components/dashboard/combined-chart.tsx`

---

## Issue 4: Month Filter

### Problem A — Header selector doesn't filter transactions
`getBankTransactions` and `getCCTransactions` only apply the date filter when `year` is set. If the user selects only a month (and year hasn't been explicitly put in the URL yet), filtering is skipped.

**Fix:** Default `year` to `new Date().getFullYear()` in both `getBankData` (bank page) and `getMaxData` (max page) before passing to the API, so a month selection always comes with a year.

### Problem B — No chart bar click to filter
Charts are static; clicking a bar does nothing.

**Fix:** Chart components (already `'use client'`) own their own navigation. They call `useRouter()` and `useSearchParams()` internally and call `router.push` when a bar is clicked. No callback prop needed from the server component parent — only the serializable `selectedMonth` number is passed down.

- `IncomeExpenseChart` and `MonthlySpendingChart`: call `useRouter` + `useSearchParams` internally, add `cursor="pointer"` to `Bar`, navigate to `?month=<clicked>&year=<current>` on click.
- `app/bank/page.tsx` and `app/cards/max/page.tsx`: pass `selectedMonth` (number) as a prop to charts. Pages stay as server components.

### Selected month highlight
The active month bar is visually highlighted. Charts receive `selectedMonth?: number`; the active bar renders with full opacity while others render at 40% opacity using Recharts' `Cell` component.

---

## Summary of file changes

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `Category` model |
| `prisma/migrations/...` | Auto-generated migration |
| `lib/parsers/bank-leumi.ts` | Dynamic table/header scan |
| `lib/db/cards.ts` | `bulkUpdateCCCategory` helper |
| `lib/db/categories.ts` | New — CRUD for Category model |
| `app/api/categories/route.ts` | GET + POST |
| `app/api/categories/[id]/route.ts` | PATCH + DELETE |
| `app/api/bank/transactions/route.ts` | Accept `merchant` param |
| `app/api/cards/max/transactions/route.ts` | Accept `merchant` param |
| `app/api/cards/max/transactions/[id]/route.ts` | Bulk-update category on save |
| `app/categories/page.tsx` | New management page |
| `components/categories/category-list.tsx` | New — manage category enum |
| `components/categories/merchant-mappings.tsx` | New — manage aliases |
| `components/layout/sidebar.tsx` | Add Categories nav item |
| `components/layout/bottom-nav.tsx` | Add Categories nav item |
| `components/cards/max/max-transactions-table.tsx` | Category dropdown + merchant filter |
| `components/bank/transactions-table.tsx` | Merchant click filter chip |
| `components/bank/income-expense-chart.tsx` | Responsive height + bar click |
| `components/bank/balance-chart.tsx` | Responsive height |
| `components/cards/max/category-donut.tsx` | Responsive height |
| `components/cards/max/monthly-spending-chart.tsx` | Responsive height + bar click |
| `components/dashboard/combined-chart.tsx` | Responsive height |
| `app/api/aliases/route.ts` | PATCH extended — bulk-update live CC transactions on category change |
| `app/bank/page.tsx` | Default year, pass selectedMonth to charts |
| `app/cards/max/page.tsx` | Default year, pass selectedMonth to charts |
