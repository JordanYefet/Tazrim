# Tazrim Design System

What Tazrim's interface already does, written down. Read it before adding UI.
Live tokens and components: run the dev server and open `/design`.

Everything here is taken from the code as it is today. Where the code disagrees with itself, the disagreement is listed under [Known gaps](#known-gaps) instead of being smoothed over. Example values in this document are made up.

## Principles

- **Hebrew-first, RTL.** Use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`), never physical left/right, so the layout mirrors on its own. Charts are the exception: they are laid out LTR inside (January on the left) because SVG `text-anchor` flips under `dir="rtl"` and pushes Recharts axis labels into the plot (see the comment above `.recharts-wrapper svg` in `app/globals.css`). Numbers and money use `tabular-nums`; Hebrew text that embeds a Latin or numeric name goes in `<bdi>`.
- **Calm.** Data first. One hero figure per page (`.surface-hero`, for example the net balance on the overview). No decoration for its own sake.
- **Stable layout.** Elements never change place when state changes. Dim them (`DimmablePair`: opacity and grayscale, the space and size are kept), reserve the space, or show a faint placeholder (`EmptyMonthSlots` for a month with no data yet) instead of collapsing or reflowing. A heading row keeps a minimum height whether or not it has actions, so the content under it starts at the same place on every page.
- **No AI design tropes.** No coloured side stripe, accent bar or gradient wash on cards, rows or headers. An account's identity colour lives on its face (the card or bank element, and the mini face in pills and lists) and nowhere else. Surfaces are flat tonal fills with a hairline edge and an elevation shadow.
- **Glass is baked.** The liquid-glass lens is pre-rendered once into a canvas (`glassBaked`, `components/glass/glass-surface.tsx`, `lib/glass/bake.ts`). Never put a live `backdrop-filter` on content. Live blur exists only on app chrome and floating panels (see Known gaps). Under reduced transparency or more contrast, glass becomes an opaque surface.
- **One clock.** Every duration and easing comes from the motion tokens (`--motion-*`, `--ease-*`, mirrored for JavaScript in `lib/motion.ts` and as Tailwind `duration-quick|fast|base|page`, `ease-ui|spring`). Respect `prefers-reduced-motion`: movement stops, opacity-only fades may stay.
- **Windows are the app dialog.** Every window is `AppDialog`: a sheet from the bottom on phones, a centred window elsewhere, growing out of the tap that opened it. The create window is the same window as the edit window.
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

Each of these also has a `-foreground` partner for text on top of it (for example `--primary-foreground`). `--input` equals `--border`.

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
| `--motion-base` | 380ms | Overlays arriving (dialogs, sheets), the tab capsule, the segmented thumb |
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
| Hero figure | `text-4xl sm:text-[2.75rem] font-semibold tracking-tight tabular-nums` (`text-3xl` when compact) | The net balance in `components/dashboard/summary-cards.tsx` |

On touch screens every input gets 16px so iOS does not zoom into it.

## Components

Shared building blocks live in `components/ui/`. Reach for these before writing your own.

- **AppDialog** (`components/ui/app-dialog.tsx`). The app's window: a bottom sheet on phones, a centred window (max `max-w-lg`) on wider screens, opaque `.surface-overlay`, scrim behind. Use it for every window: forms, details, pickers. Do not use it for a one-line confirmation (use `ConfirmDialog`) or an anchored menu.
- **ConfirmDialog / useConfirm** (`components/ui/confirm-dialog.tsx`). The confirmation window: a compact card above the tab bar on phones, centred elsewhere, growing out of the tapped button. The confirm button is red by default (`destructive: false` for a neutral action); it can hold extra fields such as type-to-confirm. Use `useConfirm()` to ask from an event handler. Not for forms.
- **SegmentedTrack** (`components/ui/segmented.tsx`). The track of a segmented control with one thumb that slides to the selected option. The options stay your own elements, marked `data-segment` with `data-on` on the selected one. Use it for tabs, filters and kind switches; pass `carryId` when the control remounts with the page it switches. Not for a long list of options (use a select).
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
- **MonthBarsChart** (`components/cards/month-bars.tsx`). A stat tile's mini chart: twelve thin bars made of plain divs, January on the left, the highlighted month darker, months after the latest data as faint 3px stubs, an optional dashed average line. Pure layout logic is in `lib/insights/month-bars.ts`. Tones: `neutral` (grey) and `cc` (card colour).

Page-level helpers live in `components/accounts/page-parts.tsx`: `PageHeading`, `ChartHeader`, `EmptyState` and the `SECTION` class.

## Patterns

**Page header.** `PageHeading` (`components/accounts/page-parts.tsx`): the `h1` page title, an optional badge, and actions at the end of the row. The row keeps a minimum height (`min-h-[2.375rem]`) with or without actions, so the content below starts in the same place on every page. The period is not repeated here: the header's month and year pickers show it. On `/banks` and `/cards` phones also get account pills under the heading. Pages wrap their content in `.page-in`: everything below the heading rises 6px and fades in on the page beat, together, while the heading stays put.

**Hero figure with rolling digits.** One per page, on `.surface-hero`: a muted label (`text-sm font-medium text-muted-foreground`), then the figure in `text-4xl` semibold with `tabular-nums` inside a `RollingNumber`, coloured `--income` when positive and `--expense` when negative. Supporting numbers around it are also `RollingNumber`s so the whole page lands on the same beat.

**Charts.** Every monthly chart plots January to December. A month with no data is an empty slot (`EmptyMonthSlots`, a tooltip saying there is no data), and months after the latest data are faint stubs, never a bar that reads as "spent 0". Rows come from `yearChartRows` (`lib/insights/chart-months.ts`), which sets empty months to null. Charts are laid out LTR inside the RTL page, with January on the left. Axis spacing and tick size come from `useChartAxes` (`hooks/use-chart-axes.ts`): on phones every other month label shows, but the selected month always does. Entrance animation comes from `CHART_ANIMATION` in `lib/motion.ts` so charts land on the page beat. Series use the chart tokens; the selected month's bars brighten and the others dim with a soft fade (opacity only). Tooltips are `.surface-overlay`.

**Tables.** A table sits in a `.surface` card (`SECTION`: `rounded-xl surface p-4 sm:p-6`, or no padding with the table edge to edge). Header row: `border-b bg-muted/50`, cells `text-xs font-medium text-muted-foreground`. Body cells `text-sm`, amounts in `tabular-nums`. Optional columns are chosen with `ColumnPicker` and settle in or out with the `.col-in` / `.col-out` animations. Changing data fades with `DataSwap`.

**Centred pills.** Pills are `inline-flex h-8 items-center justify-center rounded-full px-3.5 text-sm`: a fixed height, the label centred in it, `ring-1 ring-inset` for the outline. Selected is a tint of the same colour (a destructive pill when selected for removal). The dashed "add" pill has the same size and a dashed border. Labels that may contain a Latin name go in `<bdi>`. In the Categories settings, kinds are colour-coded (income `--income`, expense `--expense`) as small dots, and rows carry no per-row dropdowns: a category opens in its window.

**Windows.** Always `AppDialog`. The create window is the edit window: Categories opens "קטגוריה חדשה" and an existing category in the same dialog component (`components/categories/categories-view.tsx`), and the add-account form and the edit-account form are the same `AccountForm` (`components/accounts/add-account-form.tsx`). Scrim, entrance (grow out of the tap, fold back toward it) and exit come from `app/globals.css` (`.app-window`, `.dialog-scrim`) and `components/ui/open-origin.ts`.

**Settings list.** `app/settings/page.tsx`: a centred column (`mx-auto max-w-3xl space-y-10`) with the page `h1`, then sections (`space-y-3`) each with a `text-lg font-semibold` heading. Lists of things (accounts) are one `.surface` card per group: a small header row (`border-b px-4 py-3 text-sm font-medium`, icon, group name, count in muted `tabular-nums`), then `ul.divide-y` of rows (`px-4 py-3 md:px-6`). A row is one tappable button with the account's `AccountMini` face (`w-11`), its name and a chevron; tapping opens the edit window, where archive and delete live, so rows have no buttons of their own. Archived accounts go in a collapsed "בארכיון" `details` card and render dimmed and greyscale.

**Empty states.** `EmptyState` (`components/accounts/page-parts.tsx`): a dashed `.surface` card, a 48px tinted icon tile, a `text-lg` title, one muted sentence (`max-w-sm`, `text-pretty`) and at most a couple of action buttons (primary filled, secondary outlined). The overview's "no data for year" state follows the same layout.

**Account colour and glass.** An account's colour is three gradient stops set inline on its face (`--face-a/b/c`, registered with `@property` so a change cross-fades). A light colour sets `data-ink="dark"` and the text turns near-black (`--acct-ink-dark`). Glass (`data-glass`) is a translucent face whose text follows the theme and whose dots and chart series use `--acct-glass`. Large faces (a hero, the front wallet card, the add and edit preview) show the baked lens through `GlassSurface` (`components/glass/glass-surface.tsx`); everything else gets the static look (a light tint, a thin rim, an inner highlight). Faces are physical objects: their layout is physical (chip on the left, network bottom right) and is not mirrored by RTL. The identity colour appears on the face and nowhere else (no stripe on the row that holds it).

## Do / Don't

Run through this before opening a UI PR.

- Do use logical properties (`ms-`, `pe-`, `text-start`). Don't use `ml-`, `pr-`, `text-left` or `text-right` for layout.
- Do take every colour from a token (`hsl(var(--...))` or the Tailwind alias). Don't add a hex or rgb value to a component; add or reuse a token.
- Do take every duration and easing from the motion tokens (`duration-quick|fast|base|page`, `ease-ui|spring`, `lib/motion.ts`). Don't write `300ms` or `ease-in-out`.
- Do make every window an `AppDialog` (or `ConfirmDialog` for a yes/no). Don't build a new `Dialog.Root`, and don't make the create window differ from the edit window.
- Do keep elements in place when state changes: dim (`DimmablePair`), reserve the space, show a faint placeholder. Don't collapse, hide or reflow.
- Do keep an account's colour on its face. Don't add a coloured side stripe, accent bar or gradient wash to a card, row or header.
- Do use the baked lens for glass. Don't add `backdrop-filter` to content.
- Do give a surface its place on the scale (`.surface`, `.surface-raised`, `.surface-overlay`; one `.surface-hero` per page). Don't hand-write a box-shadow.
- Do put money and counts in `tabular-nums`, and headline figures in `RollingNumber`. Don't format currency by hand.
- Do plot January to December on monthly charts with `EmptyMonthSlots`. Don't draw a missing month as a zero bar, and don't drop future months.
- Do keep charts LTR inside the RTL page. Don't mirror a chart's axes.
- Do use `SegmentedTrack` for a segmented control and `Reveal` for something that opens in place. Don't re-implement the thumb or the height animation.
- Do honour reduced motion and reduced transparency (movement off, glass opaque). Don't rely on shadow alone to show height in dark mode.
- Do wrap Latin names inside Hebrew text in `<bdi>`.
- Do change only the element a request names. Don't restyle its neighbours; suggest it.
- Do use made-up example values in docs, tests and the `/design` page. Don't paste real names, amounts or account numbers.

## Known gaps

Found while reading the code. Nothing here is fixed in this change.

- **Hard-coded chart text and grid colours.** Six chart files define `textColor` and `gridColor` as hex (`#8a9ab0`/`#607080`, `#283040`/`#e2e8ed`) by theme: `components/bank/income-expense-chart.tsx`, `components/bank/balance-chart.tsx`, `components/cards/monthly-spending-chart.tsx`, `components/cards/category-trend-chart.tsx`, `components/dashboard/cc-monthly-chart.tsx`, `components/dashboard/combined-chart.tsx`. Follow-up: add chart text and grid tokens with a dark value and read them in `useChartAxes`.
- **Series colours repeat a fallback hex.** The same charts write `var(--chart-income, #2e8a5e)` and pick the light or dark fallback by theme, although the token already changes with the theme. Follow-up: drop the fallback and the `isDark` branch.
- **Live blur on app chrome and panels.** `.bar-glass` (the top bar and the sidebar) and `.glass-pill` (the phone tab bar) use `backdrop-filter`, and so do the rail flyout (`backdrop-blur-xl` in `components/layout/rail-flyout.tsx`) and the search scrim (`backdrop-blur-[2px]` in `components/search/command-search.tsx`), against the baked-glass principle. They sit over scrolling content, which is why they blur live (the comment in `app/globals.css` says so). Follow-up: decide whether this stays the one documented exception for chrome.
- **Edit window is not built on AppDialog.** `components/accounts/edit-account-dialog.tsx` has its own `Dialog.Root` with a copy of AppDialog's classes (and a different width and bottom padding), although `AppDialog` says every window builds on it. Follow-up: render it through `AppDialog` with a `className`.
- **Account create is inline, not a window.** On Settings the add-account form opens inline in `components/accounts/accounts-manager.tsx`, and edit opens in a dialog. They share one form (`AccountForm`) but not one container. Follow-up: open create in the same window as edit.
- **Defined but unused tokens.** `--income-foreground`, `--expense-foreground` and `--cc-foreground` are defined in light and dark but nothing reads them. Follow-up: remove, or use them for text on those fills.
- **Table header uses physical alignment.** `components/bank/transactions-table.tsx` sets `text-right` on headers and `uppercase tracking-wide` (which does nothing for Hebrew). Follow-up: `text-start`, drop the uppercase.
- **Tokens outside the registry.** The registry (and so `/design`) covers 39 of the custom properties; others such as `--acct-glass`, `--acct-ink-dark`, the account face stops (face-a, b, c, set inline) and the page-background tile properties (set from a cookie) are documented only in prose. `--acct-ink-dark` has no dark value (intentional: it is the ink for light faces). Follow-up: decide whether account tokens join the registry.
- **Brand colours duplicated in TypeScript.** `lib/brand/colors.ts` mirrors `--primary`, `--background` and `--card` as hex for the app icon and manifest; the ink `#16181d` in `components/accounts/color-picker.tsx` repeats `--acct-ink-dark` (22 24 29). Both must be kept in step by hand. Follow-up: a test that compares them with `app/globals.css`.
- **One transition without a motion token.** `.acct-material--light` in `app/globals.css` uses `var(--motion-fast) ease` instead of `var(--ease-ui)`, and `CHART_ANIMATION` uses `ease-out` (the Recharts name) rather than `EASE.ui`. Follow-up: align, or note why.
- **No type or spacing tokens.** Sizes and spacing are Tailwind classes used by convention (see Type). Follow-up: none needed unless a page starts to drift.
