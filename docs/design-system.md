# Tazrim Design System

What Tazrim's interface already does, written down. Read it before adding UI.
Live tokens and components: run the dev server and open `/design`.

Everything here is taken from the code as it is today. Where the code disagrees with itself, the disagreement is listed under [Known gaps](#known-gaps) instead of being smoothed over. Example values in this document are made up.

## Principles

- **Hebrew-first, RTL.** Use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`), never physical left/right, so the layout mirrors on its own. Charts are the exception: they are laid out LTR inside (January on the left) because SVG `text-anchor` flips under `dir="rtl"` and pushes Recharts axis labels into the plot (see the comment above `.recharts-wrapper svg` in `app/globals.css`). Numbers and money use `tabular-nums`; Hebrew text that embeds a Latin or numeric name goes in `<bdi>`.
- **Whole shekels everywhere except the transaction detail.** Headline figures, stat tiles, chart tooltips, summaries, bulk-bar totals, recurring totals and the projection show whole shekels (`RollingNumber` `currency`, `formatCurrencyWhole`). Agorot (`formatCurrency`, `currencyExact`) stay only where one transaction is the subject: the transaction tables' and phone rows' own amounts, and the category window.
- **Tap targets are 44px.** Every control that can be tapped has a 44px hit area (`min-h-11`/`min-w-11`, or padding, or an invisible `::before` such as `before:absolute before:-inset-2`), also when it is drawn smaller (a 16px checkbox, a 22px icon button, a 32px header button). The hit area grows around the control and never moves the layout; where two small controls sit side by side the later one wins the overlap.
- **Calm.** Data first. One hero figure per page (`.surface-hero`, for example the net balance on the overview). No decoration for its own sake.
- **One hero, one list.** One hero + one list per page; the rest is one tap deeper. The overview's hero carries the net figure and the rows that make it; charts and breakdowns sit below or behind a tap.
- **A month in progress is not a verdict.** A month in progress gets no verdict colour and no comparisons. Its figures are partial, so green, red and "above the average" would mislead.
- **Stable layout.** Elements never change place when state changes. Dim them (`DimmablePair`: opacity and grayscale, the space and size are kept), reserve the space, or show a faint placeholder (`EmptyMonthSlots` for a month with no data yet) instead of collapsing or reflowing. A heading row keeps a minimum height whether or not it has actions, so the content under it starts at the same place on every page.
- **No AI design tropes.** No coloured side stripe, accent bar or gradient wash on cards, rows or headers. An account's identity colour lives on its face (the card or bank element, and the mini face in pills and lists) and nowhere else. Surfaces are flat tonal fills with a hairline edge and an elevation shadow.
- **Glass is baked.** The liquid-glass lens is pre-rendered once into a canvas (`glassBaked`, `components/glass/glass-surface.tsx`, `lib/glass/bake.ts`). Never put a live `backdrop-filter` on content. Live blur exists only on app chrome and floating panels (see Known gaps). Under reduced transparency or more contrast, glass becomes an opaque surface.
- **One clock.** Every duration and easing comes from the motion tokens (`--motion-*`, `--ease-*`, mirrored for JavaScript in `lib/motion.ts` and as Tailwind `duration-quick|fast|base|page`, `ease-ui|spring`). Respect `prefers-reduced-motion`: movement stops, opacity-only fades may stay.
- **Gestures feel held.** A gesture responds on pointer-down, tracks the finger 1:1, stays interruptible (a new touch takes the thing from wherever it is, mid-spring) and always has a tap alternative (and keyboard). Springs are JavaScript-driven (`lib/nav/bubble-physics.ts`: response and damping ratio, as Apple's), never CSS `linear()` easing, which iOS runs on the main thread.
- **Windows are the app dialog.** Every window is `AppDialog`: a sheet from the bottom on phones, a centred window elsewhere, growing out of the tap that opened it. The create window uses the same window (the `AppDialog` shell) as the edit window.
- **Keep changes scoped.** A visual tweak applies to the element it names, not to its siblings or to every similar component. Suggest the wider change instead of making it.

## Tokens

All tokens are CSS custom properties in `app/globals.css`. Colour tokens (`--background` ... `--ring`, `--income`, `--expense`, `--cc`) are HSL triplets without the `hsl()` wrapper; use them as `hsl(var(--token))` or through the Tailwind aliases in `tailwind.config.ts` (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`, `text-income`, ...). The `.dark` class swaps the values. Light and dark values below are copied from the file.

### Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | 210 25% 97% | 220 28% 9% | Page background |
| `--foreground` | 214 35% 10% | 210 20% 94% | Primary text |
| `--card` | 0 0% 100% | 220 24% 13% | Card surface (`.surface`) |
| `--primary` | 199 72% 38% | 196 65% 48% | Main action, links, focus |
| `--secondary` | 210 20% 93% | 220 20% 18% | Secondary button |
| `--muted` | 210 20% 93% | 220 20% 18% | Quiet fills: fields, tracks, badges |
| `--muted-foreground` | 214 20% 45% | 214 15% 55% | Secondary text, captions |
| `--accent` | 210 20% 93% | 220 20% 18% | Hover and selection |
| `--destructive` | 3 72% 50% | 3 60% 42% | Destructive actions only |
| `--border` | 210 18% 88% | 220 18% 22% | Outlines and dividers |
| `--ring` | 199 72% 38% | 196 65% 48% | Focus ring |

Only `--card`, `--primary`, `--secondary`, `--muted`, `--accent` and `--destructive` have a `-foreground` partner for text on top of them (for example `--primary-foreground`). `--input` equals `--border`.

### Semantic

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--income` | 158 55% 32% | 158 50% 42% | Income: figures, icons, the income kind dot |
| `--expense` | 3 72% 50% | 3 65% 55% | Expense: figures, icons, the expense kind dot |
| `--cc` | 31 60% 45% | 31 60% 55% | Credit card |

Net positive reads in `--income`, net negative in `--expense`. Soft fills use the same colour at 8-12% (`bg-[hsl(var(--income)/0.12)]`).

### Charts

Chart colours are complete colour values (hex), not triplets, so JavaScript and SVG can use `var(--chart-1)` directly.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--chart-income` | #2e8a5e | #3aad76 | Income series |
| `--chart-expense` | #d94040 | #e05c52 | Expense series |
| `--chart-cc` | #b8732a | #d4955a | Card series |
| `--chart-1` | #1e9bbf | #3aaddb | Category 1; the balance line |
| `--chart-2` | #2e8a5e | #3aad76 | Category 2 |
| `--chart-3` | #b8732a | #d4955a | Category 3 |
| `--chart-4` | #d94040 | #e05c52 | Category 4 |
| `--chart-5` | #8b62c9 | #9b72cf | Category 5 |
| `--chart-6` | #2eb8a0 | #3bb8a8 | Category 6 |
| `--chart-7` | #d96840 | #e07a5f | Category 7 |
| `--chart-8` | #c45c9a | #d67ab1 | Category 8 |
| `--chart-9` | #7aab38 | #8bc34a | Category 9 |
| `--chart-10` | #3090c0 | #40b4c4 | Category 10 |

`lib/nav/state.ts` also hands accounts a positional colour from this palette (`CARD_COLORS`, `BANK_COLORS`) when their brand has no face of its own.

### Depth and surfaces

One elevation scale for the whole app, defined once in `app/globals.css`:

| Level | Class | Tailwind | Use |
| --- | --- | --- | --- |
| 0 | page backdrop (`body::before`, `--page-backdrop`) | | The quiet tonal gradient behind everything |
| 1 | `.surface` | `shadow-e1` | Section cards: charts, lists, tables |
| 2 | `.surface-raised` | `shadow-e2` | Key figures, links that lift |
| 2+ | `.surface-hero` | | The one hero figure per page: raised, plus a soft primary light (`--hero-light`) |
| 3 | `.surface-overlay` | `shadow-e3` | Tooltips, menus, dialogs, sheets (opaque) |

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--elevation-1` | 2 soft layers | inner top rim + 1 layer | `.surface` |
| `--elevation-2` | 3 soft layers | inner top rim + 2 layers | `.surface-raised` |
| `--elevation-hero` | `--elevation-2` + a long soft drop | inner top rim + 2 layers | `.surface-hero` |
| `--elevation-3` | 3 layers | inner top rim + 2 layers | `.surface-overlay` |
| `--surface-edge` | 214 24% 88% | 220 18% 20% | The hairline around every surface |

Supporting tokens: `--shadow-color` (215 45% 28% light, 224 60% 3% dark) tints every shadow toward the page hue, never pure black on light. `--surface-raised` (0 0% 100%, 220 22% 16% dark) and `--surface-overlay` (0 0% 100%, 220 22% 17% dark) are the fills of levels 2 and 3. In dark mode shadows barely read, so height is carried by a lighter fill and a faint rim of light along the top edge. Under `prefers-contrast: more` the edge becomes the foreground at 40% and the hero light is removed.

The exact shadow stacks (light):

```css
--elevation-1: 0 1px 2px hsl(var(--shadow-color) / 0.04), 0 2px 6px -2px hsl(var(--shadow-color) / 0.06);
--elevation-2: 0 1px 2px hsl(var(--shadow-color) / 0.06), 0 6px 14px -6px hsl(var(--shadow-color) / 0.12), 0 18px 36px -16px hsl(var(--shadow-color) / 0.16);
--elevation-3: 0 2px 6px hsl(var(--shadow-color) / 0.08), 0 14px 30px -8px hsl(var(--shadow-color) / 0.2), 0 32px 64px -20px hsl(var(--shadow-color) / 0.24);
```

### Radius

| Token | Value | Use |
| --- | --- | --- |
| `--radius` | 0.625rem | `rounded-lg`. Tailwind derives `rounded-md` (minus 2px), `rounded-sm` (minus 4px) and `rounded-xl` (plus 4px) from it |

In practice: section cards `rounded-xl`, buttons and fields `rounded-lg`, pills `rounded-full`, dialogs `rounded-3xl` (top corners only on a phone sheet). `--radius` has no dark value; it does not change with the theme.

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--motion-quick` | 140ms | Press feedback, small popovers (the rail flyout) |
| `--motion-fast` | 240ms | Exits, hover, small fades |
| `--motion-base` | 380ms | Overlays arriving (dialogs, sheets), the segmented thumb (the tab capsule is a JS spring, see Tab bar) |
| `--motion-page` | 600ms | A page arriving: the card spring, the content fade, the numbers' roll and the charts' entrance start together and land on this beat |
| `--ease-ui` | cubic-bezier(0.23, 1, 0.32, 1) | Default for every transition: things arriving or responding. A bare `transition-*` class uses this |
| `--ease-spring` | cubic-bezier(0.32, 0.72, 0, 1) | iOS-like drawer curve: things moving into place (the tab capsule) |

Motion tokens are global, with no dark value. `lib/motion.ts` exports `MOTION`, `EASE`, `LAND_AT`, `CHART_ANIMATION` and `ROLL` for WAAPI, Recharts and the rolling digits; keep it in step with the CSS.

### Type

Heebo, self-hosted from `app/fonts.ts` (Hebrew and Latin subsets, so a page view never contacts a third party). Use it through `font-sans`; never set a font family inline. There are no type tokens; sizes are Tailwind classes, used like this:

| Role | Classes | Where |
| --- | --- | --- |
| Page title | `text-2xl font-semibold tracking-tight` | Every page's `h1` (the About page adds `md:text-3xl`) |
| Section title | `text-lg font-semibold` | Settings sections, empty-state titles |
| Chart / card title | `text-base font-semibold` | `ChartHeader` |
| Body and controls | `text-sm` | Rows, buttons, fields, table cells |
| Caption | `text-xs text-muted-foreground` | Hints, legends, table headers |
| Hero figure | `text-4xl sm:text-[2.75rem] font-semibold tracking-tight tabular-nums` (`text-3xl` when compact) | The net figure in the overview hero, `components/dashboard/summary-cards.tsx` (foreground colour while the month is in progress) |

On touch screens every input gets 16px so iOS does not zoom into it.

## Components

Shared building blocks live in `components/ui/`. Reach for these before writing your own.

- **AppDialog** (`components/ui/app-dialog.tsx`). The app's window: a bottom sheet on phones, a centred window (max `max-w-lg`) on wider screens, opaque `.surface-overlay`, scrim behind. Use it for every window: forms, details, pickers. Do not use it for a one-line confirmation (use `ConfirmDialog`) or an anchored menu.
- **ConfirmDialog / useConfirm** (`components/ui/confirm-dialog.tsx`). The confirmation window: a compact card above the tab bar on phones, centred elsewhere, growing out of the tapped button. The confirm button is red by default (`destructive: false` for a neutral action); it can hold extra fields such as type-to-confirm. Use `useConfirm()` to ask from an event handler. Not for forms.
- **SegmentedTrack** (`components/ui/segmented.tsx`). The track of a segmented control with one thumb that slides to the selected option. The options stay your own elements, marked `data-segment` with `data-on` on the selected one. Use it for tabs, filters and kind switches; pass `carryId` when the control remounts with the page it switches. Not for a long list of options (use a select).
- **SegmentedTabs** (`components/ui/segmented-tabs.tsx`). A ready-made two- or three-way switch on `SegmentedTrack`: equal-width options in a `bg-muted` track. Use it for a kind switch (expense / income on /categories, bank / card in the add-account sheet). After a switch, the list under it slides in from the chosen tab's side with `.categories-list`.
- **RollingNumber / DigitStrip** (`components/ui/rolling-number.tsx`). Rolling digits, as in SwiftUI's numeric text. `RollingNumber` formats `currency`, `currencyExact`, `integer`, `decimal` or `percent` in he-IL and rolls on the page beat. Use it for every headline figure that changes with the period. `DigitStrip` is one digit, used by the card-number preview. Not for table cells in long lists.
- **EmptyMonthSlots** (`components/ui/month-slots.tsx`). Faint placeholder tracks for months with no data, drawn through Recharts' `Customized` before the bars, a little stronger on the selected month. It comes with `clickedMonth`, `EmptyMonthTooltip` and `isEmptyMonthPayload`. Use it on every monthly bar chart.
- **DataSwap** (`components/ui/data-swap.tsx`). A wrapper that fades the old rows into the new when the data behind a table changes (filters, period, page). Mark the part that should fade with `data-swap`. Use it around remounted tables; for a client component that stays mounted use `hooks/use-data-swap.ts` directly.
- **DimmablePair** (`components/ui/dimmable-pair.tsx`). Two cards side by side (stacked on phones), equal width and height, either of which can be dimmed (opacity and grayscale, inert) without moving. Use it when a filter turns one side off. This is the stable-layout rule as a component.
- **Reveal** (`components/ui/reveal.tsx`). A block that opens and closes in place: height eases between 0 and its content, the content fades and settles 4px, and it is inert while closed. Use it for filter panels and extra settings. Not for something that must keep its place when closed (dim that instead).
- **ColumnPicker** (`components/ui/column-picker.tsx`). The "עמודות" dropdown choosing which optional columns a transaction table shows; the choice is a cookie shared by every table of that kind. Use it on transaction tables only.
- **PaymentCard** (`components/accounts/account-element.tsx`). The credit card face in ISO proportions (85.6 by 54), sized by its container, with brand face, material layers, issuer, last four and network. Props include `amount` (the period total in the middle band), `live` (digits roll in as typed), `tilt` (desktop pointer only) and `glassBaked`. Use it to show a card; it is where a card's identity colour lives.
- **BankElement** (`components/accounts/account-element.tsx`). The bank account element: a coloured band over a raised body, the balance as hero, optional totals and a sparkline trend, `hero` for the page-sized one. Not for cards.
- **AccountMini** (`components/accounts/account-element.tsx`). A tiny face for pills, rows and pickers; width comes from the class, height follows. Use it wherever a list needs to say which account without a side stripe or a dot. It is `aria-hidden` and carries no text, so it never stands alone: put the account's name next to it. Not for a page-sized or detailed view (use `PaymentCard` or `BankElement`).
- **Sparkline** (`components/accounts/account-element.tsx`). A small balance trend line, two points or more, drawn in `currentColor`.
- **BalanceChart** (`components/bank/balance-chart.tsx`). The bank account's balance line (Recharts `LineChart`) with an optional link to the category analysis in its header. Uses `ChartHeader`, `useChartAxes` and `useChartAnimation`.
- **Insights switch** (`components/layout/insights-switch.tsx`, `app/(insights)/layout.tsx`). Phone only (`md:hidden`): תחזית · קבועים · ניתוח as three equal links on a `SegmentedTrack`, above the page's own h1. It lives in the route group's layout, so it stays mounted while the page changes and the thumb slides; the URLs are unchanged and the desktop sidebar keeps its separate links. The page shown is saved in `localStorage` (`tazrim:insights`) and is where the תובנות tab leads next time; the period stays on every link.
- **Wallet views** (`components/cards/wallet-views.tsx`, `lib/nav/wallet-view.ts`). Phones only (below `lg`): on /cards, /banks and an account's page, a two-option `SegmentedTrack` right under the wallet, תנועות · מגמות. תנועות (the default) shows the transactions; מגמות shows what desktop puts beside the wallet (each account's figures) and the charts. The hero figure is on the wallet's faces either way. The parts mark themselves `data-view="list"` or `data-view="trends"` and CSS hides the other view, so nothing remounts and nothing is fetched; under the wallet the blocks follow page order, so a hidden view leaves no gap. The choice holds in memory while you move between the stack and an account's page. The bank pages show the period's net on the wallet itself, in the same corner on both: at the end of the navy pocket's foot on /banks (where the card pocket has its mark), and at the end of the open bank's foot on an account's page (its trend line gives up 16px so the face keeps its card shape). It is signed and neutral, no green or red: a month in progress gets no verdict (`formatNet`). Desktop shows everything, as before.
- **CategoryBars** (`components/dashboard/category-bars.tsx`). The overview's categories as a list that is the chart: a thin strip (8px, rounded, a 2px gap between segments) of the period's shares, then a row per category (`min-h-11`, a link to its transactions) with the name, the amount in a `RollingNumber` and a 6px bar relative to the largest row, on a `bg-muted` track. The top six of the year keep a row and a colour, the rest are summed in "אחר (n)" in a neutral colour (no link). Rows come from the year's ranking (`groupCategoryBars`, `lib/insights/category-bars.ts`), so a month only changes widths and amounts: a category with nothing keeps its row, an empty bar and a dimmed ₪0. Widths ease on the page beat and nothing remounts. Text stays in text tokens. Not for a series over time (use a chart).
- **MonthBarsChart** (`components/cards/month-bars.tsx`). A stat tile's mini chart: twelve thin bars made of plain divs, January on the left, the highlighted month darker, months after the latest data as faint 3px stubs, an optional dashed average line. Pure layout logic is in `lib/insights/month-bars.ts`. Tones: `neutral` (grey) and `cc` (card colour).

Page-level helpers live in `components/accounts/page-parts.tsx`: `PageHeading`, `ChartHeader`, `EmptyState` and the `SECTION` class.

## Patterns

**Page header.** `PageHeading` (`components/accounts/page-parts.tsx`): the `h1` page title, an optional badge, and actions at the end of the row. The row keeps a minimum height (`min-h-[2.375rem]`) with or without actions, so the content below starts in the same place on every page. The period is not repeated here: the header's month and year pickers show it. On `/banks` and `/cards` phones also get account pills under the heading. Pages wrap their content in `.page-in`: everything below the heading rises 6px and fades in on the page beat, together, while the heading stays put.

**Tab bar (phone).** `components/layout/bottom-nav.tsx`: a glass pill (`.glass-pill`, the one live blur on chrome) of five slots (בנקים, כרטיסים, ראשי, תובנות, עוד; תובנות has a lightbulb and is lit on /projection, /recurring and /analysis; its link goes to the insights page last visited, read from `localStorage` after mount, see Insights switch), the selected one under a capsule (`.tab-highlight`). The capsule can be held (`components/layout/tab-bubble.ts`): on touch-down it lifts (scale about 1.04 over the quick beat) and jumps under the finger with a critically damped spring; it follows 1:1 and rubber-bands past either end; on release it settles with a slightly bouncy spring on the nearest slot, a flick carrying it at most one slot further (Apple's projection, deceleration 0.99), and only then does the route change. While steering, the icon under the capsule is the lit one (`[data-steering]`, `[data-hot]`). A plain tap is the same gesture without the drag, so the capsule moves on touch-down, before the page answers. Dropping on "עוד" opens the sheet; a tap on it toggles. Slots are measured in DOM order, so RTL needs no special case. Keyboard activation goes through the links. Under reduced motion the capsule still follows the finger but jumps instead of springing and does not grow. The server render places it with CSS (a slot index set inline) until the script takes over.

**Pages kept in the browser.** A tab opens at once: the tab bar fetches its four pages whole, ahead of a tap (`prefetch` on the tab links), and the browser keeps every page it has shown for five minutes (`staleTimes` in `next.config.ts`). The data only changes on a write, so `components/layout/fresh-data.tsx` drops the kept pages and refetches the page on screen after any successful write to the API (the same rule as read-only mode, `lib/read-only.ts`), and when the app comes back after a minute or more in the background (a sync may have run). A new write path needs nothing extra, as long as it is a non-GET request to `/api`. Prefetching does not run under `next dev`.

**Hero figure with rolling digits.** One per page, on `.surface-hero`: a muted label (`text-sm font-medium text-muted-foreground`), then the figure in `text-4xl` semibold with `tabular-nums` inside a `RollingNumber`, coloured `--income` when positive and `--expense` when negative, then a muted sub line. Under it, on the overview, a `dl` of rows, each at least 44px tall with a hairline top border: income, expenses (with a small chip against the monthly average) and the card charges ("מתוכן בכרטיסים", a breakdown of the expenses, never added to them). Every row figure is a `RollingNumber`, so the whole card lands on the same beat. The chip keeps its space when empty (`opacity-0`). On wide screens the figure and the rows are two equal halves. A month in progress (`monthProgress` in `lib/insights/month-progress.ts`) is labelled "החודש עד כה", its figure is in the foreground colour, its sub line says how many days have passed, and the chip is hidden; the rows stay where they are. The year view shows yearly totals and the monthly average in the expenses row's hint.

**The list is the chart.** Where a list can carry the picture, there is no donut: the overview's categories are rows with an amount and a bar (`CategoryBars`). A category keeps its colour and its position all year: the order and the six that get a row come from the year's total, the colour from the same ranking (`categoryColorMap`), so a month never reshuffles or repaints. The colour order is `CATEGORY_SLOTS` in `lib/utils/category-colors.ts`, checked with the dataviz validator against the card in light and dark (hues unchanged, only who sits beside whom). Where the donut is still used (the cards pages) it is a leftover.

**Charts.** Every monthly chart plots January to December. A month with no data is an empty slot (`EmptyMonthSlots`, a tooltip saying there is no data), and months after the latest data are faint stubs, never a bar that reads as "spent 0". Rows come from `yearChartRows` (`lib/insights/chart-months.ts`), which sets empty months to null. Charts are laid out LTR inside the RTL page, with January on the left. Axis spacing and tick size come from `useChartAxes` (`hooks/use-chart-axes.ts`): on phones every other month label shows, but the selected month always does. Entrance animation comes from `CHART_ANIMATION` in `lib/motion.ts` so charts land on the page beat. Series use the chart tokens; the selected month's bars brighten and the others dim with a soft fade (opacity only). Tooltips are `.surface-overlay`.

**Tables.** A table sits in a `.surface` card (`SECTION`: `rounded-xl surface p-4 sm:p-6`, or no padding with the table edge to edge). Header row: `border-b bg-muted/50`, cells `text-xs font-medium text-muted-foreground`. Body cells `text-sm`, amounts in `tabular-nums`. Optional columns are chosen with `ColumnPicker` and settle in or out with the `.col-in` / `.col-out` animations. Changing data fades with `DataSwap`. Tables exist from `md` up only. On phones a list is rows, edge to edge in their card, each at least 44px tall (`min-h-11`) with the amount always visible at the end and the description truncating before it (the search page uses `SearchResultList`). The transaction tables' rows (`PhoneTransactionRows`, `components/transactions/phone-rows.tsx`) are a fixed layout, every row the same height and every part in the same place: a tick box; the description and the amount; then the category as a chip in its own colour (always first, "ללא קטגוריה" holds the place), the date, the account and small icons, with a foreign amount's note at the end. Nothing wraps; what doesn't fit is cut. The columns picked in "עמודות" become a third line on every row (`columnsLine`, `lib/tables/columns.ts`). No icon tile and no buttons on the row. The toolbar above a transaction table is the same on every page: active filters at the start, "עמודות" and "הצג מוסתרים" at the end (`ms-auto`, so they stay there when the row wraps); the bank pages' all / income / expenses filter is a row of pills above it (`pillClass`, `components/accounts/account-pills.tsx`). Tapping a row opens its window, whose footer (`PhoneRowActions`, `md:hidden`) holds the row's other actions as 44px labelled buttons. Both variants are rendered and switched with CSS (`md:hidden`, `hidden md:block`), never a JS width check.

**Centred pills.** Pills are `inline-flex h-8 items-center justify-center rounded-full px-3.5 text-sm`: a fixed height, the label centred in it, `ring-1 ring-inset` for the outline. Selected is a tint of the same colour (a destructive pill when selected for removal). The dashed "add" pill has the same size and a dashed border. Labels that may contain a Latin name go in `<bdi>`. In the Categories settings, kinds are colour-coded (income `--income`, expense `--expense`) as small dots, and rows carry no per-row dropdowns: a category opens in its window.

**Windows.** Always `AppDialog`. The create window and the edit window are the same window, the `AppDialog` shell: Categories opens "קטגוריה חדשה" and an existing category in the same dialog component (`components/categories/categories-view.tsx`), and "חשבון חדש" opens the add-account sheet (`components/accounts/add-account-sheet.tsx`) in the same `AppDialog` shell as the account's edit window. Scrim, entrance (grow out of the tap, fold back toward it) and exit come from `app/globals.css` (`.app-window`, `.dialog-scrim`) and `components/ui/open-origin.ts`. On phones a sheet (an `AppDialog` below `sm`, and the "עוד" sheet) can be dragged down to close (`hooks/use-drag-to-dismiss.ts`): it follows the finger 1:1 from the first movement, the scrim fades with it, and upward it rubber-bands; let go past about 40% of its height or with a downward flick and it carries on out (a JS spring that keeps the finger's speed) and closes without the exit animation (`data-dragged-away`); otherwise it springs back. A touch inside content that is scrolled, or a sideways one, scrolls instead. The grabber at the top says it can be dragged; the close button and a tap on the scrim stay as the tap alternative.

**Step windows.** A window that walks through steps (the add-account sheet) keeps one height for every step: `h-[82dvh]` on phones, `sm:h-[600px]` wider, with `overflow-hidden` on the window. The step's content scrolls inside it, and a long list scrolls in its own card while the step's action stays at the bottom (`mt-auto`). Each step slides in 12px and fades (`.add-step`), from the left going on (the reading direction) and from the right going back, on `--motion-base`. Under reduced motion it only fades. Opening the window doesn't slide the first step.

**Settings list.** `app/settings/page.tsx`: a centred column (`mx-auto max-w-3xl space-y-10`) with the page `h1`, then sections (`space-y-3`) each with a `text-lg font-semibold` heading. Lists of things (accounts) are one `.surface` card per group: a small header row (`border-b px-4 py-3 text-sm font-medium`, icon, group name, count in muted `tabular-nums`), then `ul.divide-y` of rows (`px-4 py-3 md:px-6`). A row is one tappable button with the account's `AccountMini` face (`w-11`), its name and a chevron; tapping opens the edit window, where archive and delete live, so rows have no buttons of their own. Archived accounts go in a collapsed "בארכיון" `details` card and render dimmed and greyscale.

**Empty states.** `EmptyState` (`components/accounts/page-parts.tsx`): a dashed `.surface` card, a 48px tinted icon tile, a `text-lg` title, one muted sentence (`max-w-sm`, `text-pretty`) and at most a couple of action buttons (primary filled, secondary outlined). The overview's "no data for year" state follows the same layout.

**Account colour and glass.** An account's colour is three gradient stops set inline on its face (`--face-a/b/c`, registered with `@property` so a change cross-fades). A light colour sets `data-ink="dark"` and the text turns near-black (`--acct-ink-dark`). Glass (`data-glass`) is a translucent face whose text follows the theme and whose dots and chart series use `--acct-glass`. Large faces (a hero, the front wallet card, the add and edit preview) show the baked lens through `GlassSurface` (`components/glass/glass-surface.tsx`); everything else gets the static look (a light tint, a thin rim, an inner highlight). Faces are physical objects: their layout is physical (chip on the left, network bottom right) and is not mirrored by RTL. The identity colour appears on the face and nowhere else (no stripe on the row that holds it).

**Card grid.** Cards in a row split the width evenly: halves, thirds for three peers, or quarters, as the other pages do (`grid gap-4 sm:grid-cols-3`, stretched to one height). Never a lopsided narrow-beside-wide split. Related things that differ in kind go in separate cards, each naming its kind with a small dot and a title (the projection's income, recurring and everyday cards).

## Do / Don't

Run through this before opening a UI PR.

- Do use logical properties (`ms-`, `pe-`, `text-start`). Don't use `ml-`, `pr-`, `text-left` or `text-right` for layout.
- Do show phone lists as rows: edge to edge, 44px tap targets, the amount always visible. Don't show a wide table on a phone, where the amount scrolls out of view.
- Do take every colour from a token (`hsl(var(--...))` or the Tailwind alias). Don't add a hex or rgb value to a component; add or reuse a token.
- Do take every duration and easing from the motion tokens (`duration-quick|fast|base|page`, `ease-ui|spring`, `lib/motion.ts`). Don't write `300ms` or `ease-in-out`.
- Do make a gesture answer on pointer-down, track 1:1, stay interruptible and keep a tap and keyboard way. Don't wait for pointer-up to show anything, and don't animate a held thing with CSS transitions.
- Do make every window an `AppDialog` (or `ConfirmDialog` for a yes/no). Don't build a new `Dialog.Root`, and don't make the create window differ from the edit window.
- Do keep to one hero and one list per page; the rest is one tap deeper. Don't stack a row of stat tiles beside the hero.
- Do show a month in progress in the foreground colour with no comparisons. Don't colour it green or red, or tell it is above the average.
- Do keep elements in place when state changes: dim (`DimmablePair`), reserve the space, show a faint placeholder. Don't collapse, hide or reflow.
- Do keep an account's colour on its face. Don't add a coloured side stripe, accent bar or gradient wash to a card, row or header.
- Do use the baked lens for glass. Don't add `backdrop-filter` to content.
- Do give a surface its place on the scale (`.surface`, `.surface-raised`, `.surface-overlay`; one `.surface-hero` per page). Don't hand-write a box-shadow.
- Do show whole shekels (`currency`, `formatCurrencyWhole`) everywhere but the transaction detail. Don't show agorot in a headline, tile, tooltip or summary; keep them in a transaction's own amount.
- Do give every tappable control a 44px hit area, drawn smaller if need be (`before:-inset-*`, padding, `min-h-11`). Don't ship a 16-32px control with only its drawn size, and don't grow it in a way that moves its neighbours.
- Do put money and counts in `tabular-nums`, and headline figures in `RollingNumber`. Don't format currency by hand.
- Do let the list be the chart where it can (rows with an amount and a bar), and keep a category's colour and position all year. Don't draw a donut for the overview's categories, and don't re-rank or repaint rows when the month changes.
- Do plot January to December on monthly charts with `EmptyMonthSlots`. Don't draw a missing month as a zero bar, and don't drop future months.
- Do split cards in a row evenly and let kinds that differ have their own card. Don't make a narrow card beside a wide one, or mix kinds in one card.
- Do keep charts LTR inside the RTL page. Don't mirror a chart's axes.
- Do use `SegmentedTrack` for a segmented control and `Reveal` for something that opens in place. Don't re-implement the thumb or the height animation.
- Do honour reduced motion and reduced transparency (movement off, glass opaque). Don't rely on shadow alone to show height in dark mode.
- Do wrap Latin names inside Hebrew text in `<bdi>`.
- Do change only the element a request names. Don't restyle its neighbours; suggest it.
- Do use made-up example values in docs, tests and the `/design` page. Don't paste real names, amounts or account numbers.

## Known gaps

Found while reading the code. Nothing here is fixed in this change.

- **Hard-coded chart text and grid colours.** Six chart files define `textColor` and `gridColor` as hex (`#8a9ab0`/`#607080`, `#283040`/`#e2e8ed`) by theme: `components/bank/income-expense-chart.tsx`, `components/bank/balance-chart.tsx`, `components/cards/monthly-spending-chart.tsx`, `components/cards/category-trend-chart.tsx`, `components/dashboard/cc-monthly-chart.tsx`, `components/dashboard/combined-chart.tsx` (that one names them `text` and `grid` in one object, not `textColor` and `gridColor`). Follow-up: add chart text and grid tokens with a dark value and read them in `useChartAxes`.
- **Series colours repeat a fallback hex.** Three files write `var(--chart-income, #2e8a5e)` (and the `--chart-expense` / `--chart-cc` equivalents) and pick the light or dark fallback by theme, although the token already changes with the theme. The files are `components/bank/income-expense-chart.tsx`, `components/dashboard/cc-monthly-chart.tsx` and `components/dashboard/combined-chart.tsx`. Follow-up: drop the fallback and the `isDark` branch.
- **Pills are not all the same size.** The documented pill is `h-8 px-3.5`, but `components/categories/generic-descriptions.tsx` and `components/categories/add-chip.tsx` use `h-9 px-4`, and `components/categories/category-picker.tsx` uses `h-9 px-3.5`. Follow-up: pick one pill size, or document the taller one as a second size.
- **Create and edit windows share a shell, not content.** Categories uses `AppDialog` for both, but the create window holds `NewCategoryForm` and the edit window `CategoryDetails` (`components/categories/categories-view.tsx`), so the two look different inside. Accounts are the same: "חשבון חדש" is the step-by-step add-account sheet (choose the company, then sync or files), and the edit window holds `AccountForm` with the data source. Follow-up: decide whether create should show the same details view.
- **Raw colours in `app/globals.css`.** The chrome materials (`.glass-pill`, `.bar-glass`, `.tab-highlight`) and the `@property --face-a/b/c` defaults use raw `rgb()` and hex values. They are materials, not components, so read them as an exception and not as precedent for the "no hex or rgb" rule. Follow-up: none needed unless a component starts copying them.
- **Live blur on app chrome and panels.** `.bar-glass` (the top bar and the sidebar) and `.glass-pill` (the phone tab bar) use `backdrop-filter`, and so do the rail flyout (`backdrop-blur-xl` in `components/layout/rail-flyout.tsx`) and the search scrim (`backdrop-blur-[2px]` in `components/search/command-search.tsx`), against the baked-glass principle. They sit over scrolling content, which is why they blur live (the comment in `app/globals.css` says so). Follow-up: decide whether this stays the one documented exception for chrome.
- **Edit window is not built on AppDialog.** `components/accounts/edit-account-dialog.tsx` has its own `Dialog.Root` with a copy of AppDialog's classes (and a different width and bottom padding), although `AppDialog` says every window builds on it. Follow-up: render it through `AppDialog` with a `className`.
- **Unused create mode of the account form.** Since the add-account sheet, `AccountForm`'s create mode (`components/accounts/add-account-form.tsx`) has no caller; only the edit window uses the form. Follow-up: remove the create branches, keeping the edit form.
- **Defined but unused tokens.** `--income-foreground`, `--expense-foreground` and `--cc-foreground` are defined in light and dark but nothing reads them. Follow-up: remove, or use them for text on those fills.
- **Tokens outside the registry.** The registry (and so `/design`) covers 39 of the custom properties; others such as `--acct-glass`, `--acct-ink-dark`, the account face stops (face-a, b, c, set inline) and the page-background tile properties (set from a cookie) are documented only in prose. `--acct-ink-dark` has no dark value (intentional: it is the ink for light faces). Follow-up: decide whether account tokens join the registry.
- **Brand colours duplicated in TypeScript.** `lib/brand/colors.ts` mirrors `--primary`, `--background` and `--card` as hex for the app icon and manifest; the ink `#16181d` in `components/accounts/color-picker.tsx` repeats `--acct-ink-dark` (22 24 29). Both must be kept in step by hand. Follow-up: a test that compares them with `app/globals.css`.
- **One transition without a motion token.** `.acct-material--light` in `app/globals.css` uses `var(--motion-fast) ease` instead of `var(--ease-ui)`, and `CHART_ANIMATION` uses `ease-out` (the Recharts name) rather than `EASE.ui`. Follow-up: align, or note why.
- **No type or spacing tokens.** Sizes and spacing are Tailwind classes used by convention (see Type). Follow-up: none needed unless a page starts to drift.
