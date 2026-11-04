# Tazrim Design System — Design

**Date:** 2026-11-02
**Epic:** Projection (step 1 of 2)
**Scope:** Write down the design rules Tazrim already follows, so the projection page and every page after it are built the same way.

---

## Problem

Tazrim's look is consistent, but its rules live in three places: about 110 CSS custom properties in `app/globals.css`, the components in `components/ui/*`, and decisions the owner made along the way that aren't written anywhere in the repo. Whoever builds a new page, whether a contributor or an agent, has to reverse-engineer them, and mistakes slip through (accent stripes, layouts that jump with state, live blur).

## Goal

One document and one live page that describe the system **as it is today**. This step makes no visual changes. Where the code is inconsistent, the document records the gap rather than quietly fixing it.

## Deliverables

### 1. `docs/design-system.md`

The document a builder reads before adding UI. Sections:

1. **Principles**
   - Hebrew-first, RTL. Layout uses logical directions, and numbers and currency read correctly inside RTL text.
   - Calm and quiet. Data is the focus and decoration is minimal.
   - **Stable layout.** Elements never change place when state changes. Dim them or leave the space empty rather than collapsing or reflowing.
   - **No AI design tropes.** No coloured side stripes, accent bars or gradient washes. An account's identity colour lives on its card or bank face only.
   - **Baked glass.** The glass finish is a pre-rendered lens. Never use a live `backdrop-filter`.
2. **Tokens** — taken from `app/globals.css`, with each token's light and dark values and what it's for:
   - colour: text, surfaces, borders, income/expense/neutral, chart series, identity colours
   - surfaces and elevation levels and materials (ENG-55)
   - type: Heebo (self-hosted), sizes, weights, figures
   - spacing, radii, shadows
   - motion: the shared durations and easings (ENG-67)
3. **Components** — for each one in `components/ui/*` and the shared domain pieces: what it is, when to use it, when not to, and its path. This covers:
   - `app-dialog` and `confirm-dialog`
   - `segmented`
   - `rolling-number`
   - `month-slots`
   - `data-swap`
   - `dimmable-pair`
   - `reveal`
   - the card face and bank face
   - the chart wrappers
4. **Patterns**
   - page header
   - stat headline with rolling digits
   - charts: January to December, with months after the latest data drawn as faint stubs
   - tables
   - centred pills
   - dialogs: always the app dialog, and the create window is the same as the edit window
   - empty states
   - account colour and glass
   - the Settings list layout
5. **Do / Don't** — a short checklist to run before opening a UI PR.
6. **Known gaps** — inconsistencies found while extracting (hard-coded values, duplicated tokens), each with a suggested follow-up. None of them are fixed in this step.

### 2. `/design` page (`app/design/page.tsx`)

- Shows every token (swatches, the type scale, spacing, radii, motion demos) and a live instance of every component listed above.
- It's a server page that renders client components. A toggle switches the preview between light and dark.
- Development only: it calls `notFound()` when `process.env.NODE_ENV === 'production'`. It is not in the sidebar or the mobile nav.
- It uses only made-up example values.

## Non-goals

- New tokens, a restyle, or token renames.
- A component library package or Storybook.
- A Claude Design artifact. The repo is the source of truth.

## Testing

- A Vitest test checks that the `/design` page calls `notFound()` in production.
- A Vitest test checks that every custom property the doc names exists in `app/globals.css`. This stops the doc and the CSS drifting apart.
- Manual check on :3000: `/design` renders in light and dark, at phone width and in RTL.
