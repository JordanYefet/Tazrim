# Projection (תחזית) — Design

**Date:** 2026-11-02
**Epic:** Projection (step 2 of 2, built on `2026-11-02-design-system-design.md`)
**Scope:** A page that forecasts the next 12 months from the existing bank and card history. It answers two questions at a glance: *what will my bank balance be in a year?* and *which months get tight?*

---

## Decisions

| Question | Decision |
|---|---|
| What the page answers | Both: a headline year-end balance, and a monthly line that flags the tight months |
| Which balance | All bank accounts combined by default, with a picker for a single bank |
| Uncertainty | An expected line with a range band around it |
| Tight month | A month whose **low edge** falls below a cushion the user sets in Settings (default ₪0) |
| Algorithm | Split model: recurring items on their own schedule plus averaged everyday flows. Not a flat moving average |
| What-if planning | Out of scope (possible later epic) |

## Forecast engine — `lib/insights/projection.ts`

A pure function with no database access:

```ts
projectBalance(input: ProjectionInput): Projection
// Projection = { insufficient: true }
//            | { start, end, months: ProjectedMonth[], tight: ProjectedMonth[], items: ProjectionItem[] }
// ProjectedMonth = { month: 'YYYY-MM', income, expense, net, expected, low, high, stale, tight }
```

### Starting point
- The combined latest bank balance comes from `combinedBalance` (`lib/insights/combined-balance.ts`) applied to `getBankBalancePoints` (`lib/db/bank.ts`). With one bank selected, it's that bank's latest balance.
- The start date is the date of the latest row. Months between that date and today are projected too and marked `stale: true`, so out-of-date data can't shift the result without the page saying so.
- The horizon is the 12 months after the current month.
- The latest data month is the first row, holding what is left of that month's usual amounts. Each everyday income and expense category adds `max(0, monthly median − what that category already has in the month's bank rows)`, with the everyday exclusions (no recurring rows, no card payments). The card adds `max(0, everyday card + card recurring charges paid that month − card payments already made that month)`. Bank recurring hits dated after the start date are added in full. Nothing is prorated, so a salary that has already landed, or a card payment already made, isn't added again. The range is `σ·√fraction`, where `fraction = (days in month − day of the start date) / days in month`, and each later month's range is `σ·√(fraction + n)`. So the table usually has 13 rows.
- Recurring series are judged as of the latest data date, not the clock, so stale data neither ends a series nor skips its hits in the months since the last upload.

### Each future month is the sum of
1. **Recurring bank items** from `getRecurringSeries` (`lib/db/recurring.ts`), which already includes manual series and the user's confirm/dismiss choices.
   - Each series steps forward from `nextDate` by its cadence, using `addCycles` and `cadenceSpec` from `lib/insights/recurring.ts`. A yearly item lands only in its own month.
   - Left out: dismissed series, inactive series, and **card-payment** series (`isCardPayment`), since cards are covered by the next item.
   - Amount: `latestAmount`, so a recent price change carries forward.
2. **Card payment**, one per card, in the month the card bills the bank (following the billing-month rule of `billedIn` in `lib/db/cards.ts`). It is made up of:
   - the card's recurring series, including instalments;
   - the median of the card's non-recurring spending.
   - **Instalments** are assumed to continue across all 12 months. We don't store how many payments are left, so this cautious assumption may slightly overstate spending, never understate it. Reading "payment X of N" is a follow-up.
3. **Everyday bank flows**: the per-category **median of up to the last 24 complete months** (as many as there are; at least 3), separately for income and spending. Rows in `recurringTransactionIds` and card-payment rows are excluded. Sources: `getBankCategoryMonthly`, `getCCCategoryMonthly` and `mergeCategoryMonthly`.

The no-double-counting rule (ENG-3) holds: card spending enters the forecast once, as the projected card payment, and the bank's historical card-payment debits are never added on top.

### Seasonality
With 12 or more months of history in the window, each future month gets its own usual everyday amounts, per category for income and spending and for card spending:
- the typical month (the median) moves toward what that same calendar month held in past years;
- with two years or more of that month the move is full (their average); with one year it is half, so a one-off isn't repeated in full;
- the band then measures how far months strayed from their own season.
Under 12 months every month gets the typical month. The category donut and the item lists show the typical month either way.

### Range band
- σ is the standard deviation of the historical monthly net of the **non-recurring** flows over the same window (up to 24 complete months).
- In the *n*-th month after the latest data month: `low = expected − σ·√(fraction + n)` and `high = expected + σ·√(fraction + n)`, where `fraction` is the share of the latest data month still to come (see Starting point).

### Tight
`tight = low < cushion`. `tight[]` lists those months in date order.

### Insufficient data
With fewer than 3 complete months of bank history, the result is `{ insufficient: true }`. The page then shows an empty state ("upload at least 3 months to see a projection") instead of a guess.

### `items`
The list behind "What's in the forecast": each recurring series used (name, cadence, monthly-equivalent amount, link key) and each everyday category average.

## Data and setting

- `lib/db/projection.ts`: `getProjection({ accountId?, today })` collects the inputs and calls `projectBalance`.
- A new Prisma model plus migration, a general key/value store for preferences:
  ```prisma
  model Setting {
    key   String @id
    value String
  }
  ```
- `lib/db/settings.ts`: `getSetting` / `setSetting`. The cushion is stored under the key `projection.cushion` as a number string and defaults to `0`.
- `app/api/settings/route.ts`: GET and PUT, validating a non-negative number.
- `app/settings/page.tsx`: a "safety cushion" amount field in the Settings list.
- The page is a server page that reads `searchParams` (`?account=`), matching the existing pages. No projection API unless a client refetch turns out to be necessary.

## Page — `app/projection/page.tsx`

**Mockups are approved before any UI code**: two Design-artifact options to choose from, built on the design system. The structure, top to bottom:

1. **Headline**
   - "בעוד 12 חודשים" (in 12 months) with the expected balance in `RollingNumber`.
   - The range below it ("between ₪A and ₪B") and the change from today.
   - When there are tight months, one quiet line, e.g. "צפוי להיות דחוק במרץ — עד ₪1,200" ("expected to be tight in March, down to ₪1,200"). The line's space is reserved even when there are no tight months, so the layout stays stable.
2. **Chart** (Recharts, styled like `BalanceChart`)
   - The last 6 months of actual balance as a solid line, continuing into a dashed forecast line.
   - The range band as a soft area around the forecast.
   - The cushion as a faint horizontal line, and a small marker on each tight month.
   - Stale months drawn as faintly as the "future month" stubs.
3. **Monthly table**: 12 rows of month · in · out · end balance (expected, with low beneath it). Tight rows carry a small label. The column layout is the same whatever the state.
4. **What's in the forecast**: the recurring items and everyday averages from `items`. Each recurring item links to `/recurring`, where dismissing an item that has ended removes it from the forecast.

**Controls:** an account picker for all banks (default) or one bank, using the existing `segmented` control or the account-nav pattern, whichever the mockup picks. A cushion shortcut next to the chart opens the same setting.

**Navigation:** add "תחזית" to `MAIN_NAV` after `/recurring` (`components/layout/nav-context.tsx`) and to the mobile nav's link list (`components/layout/bottom-nav.tsx`).

**States:** insufficient data, which shows the empty state; and no banks, which shows the existing no-accounts empty state.

## Testing

**Unit tests** (Vitest, `lib/insights/__tests__/projection.test.ts`, made-up data dated 2030):
- A yearly item lands only in its own month and creates a tight month.
- A card payment series in the bank history isn't counted a second time.
- Dismissed and inactive series are left out.
- A card payment lands in its billing month.
- The median ignores a one-off spike.
- The band widens with the horizon (σ·√(fraction + n)).
- Fewer than 3 months of history returns `insufficient`.
- Months between the last data and today are flagged `stale`.

**DB tests** (`lib/db/__tests__/projection.test.ts` with `createTestDb`):
- `getProjection` end to end on seeded rows.
- `Setting` round-trip and the cushion default.

**Checks:** `npm test` and `npx tsc --noEmit`.

**Manual check on :3000 with demo data:**
- headline, band and picker
- a high cushion forces a tight month
- dark mode, phone width, RTL

## Follow-ups (not in this spec)

- Read instalment "payment X of N" to end plans on time.
- What-if items (planned expenses and income).
