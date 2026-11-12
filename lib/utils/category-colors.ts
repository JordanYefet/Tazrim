/**
 * Stable category → color mapping. Pass categories ranked by yearly spend so a
 * category keeps the same color on every chart regardless of the filtered period.
 * Colors are CSS vars (`--category-N`, defined per theme in globals.css: the chart
 * palette in light mode, a set tuned for the dark card in dark mode) so SSR markup
 * matches and the colour switches with the theme without a flash.
 */
export function categoryColorMap(rankedCategories: string[]): Record<string, string> {
  return Object.fromEntries(rankedCategories.map((c, i) => [c, categoryColor(CATEGORY_SLOTS[i % 10])]))
}

/** The CSS colour of category slot `n` (1-10) */
export function categoryColor(n: number): string {
  return `var(--category-${n})`
}

/**
 * The order the --category-N tokens are handed out in. Validated with the dataviz script
 * (adjacent pairs, light and dark): in token order 3 and 4 (amber, red) are 2.4 apart
 * under deutan vision; in this order the worst neighbours clear the floors. The hexes
 * are unchanged, only who sits next to whom.
 */
const CATEGORY_SLOTS = [1, 4, 9, 5, 2, 8, 3, 6, 7, 10]

export const OTHER_COLOR = 'hsl(var(--muted-foreground) / 0.5)'
