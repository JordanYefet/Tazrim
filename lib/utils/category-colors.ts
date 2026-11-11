/**
 * Stable category → color mapping. Pass categories ranked by yearly spend so a
 * category keeps the same color on every chart regardless of the filtered period.
 * Colors are CSS vars (defined per theme in globals.css) so SSR markup matches.
 */
export function categoryColorMap(rankedCategories: string[]): Record<string, string> {
  return Object.fromEntries(rankedCategories.map((c, i) => [c, `var(--chart-${CATEGORY_SLOTS[i % 10]})`]))
}

/**
 * The order the --chart-N tokens are handed out in. Validated with the dataviz script
 * (adjacent pairs, light and dark): in token order 3 and 4 (amber, red) are 2.4 apart
 * under deutan vision; in this order the worst neighbours clear the floors. The hexes
 * are unchanged, only who sits next to whom.
 */
const CATEGORY_SLOTS = [1, 4, 9, 5, 2, 8, 3, 6, 7, 10]

export const OTHER_COLOR = 'hsl(var(--muted-foreground) / 0.5)'
