/**
 * Stable category → color mapping. Pass categories ranked by yearly spend so a
 * category keeps the same color on every chart regardless of the filtered period.
 * Colors are CSS vars (defined per theme in globals.css) so SSR markup matches.
 */
export function categoryColorMap(rankedCategories: string[]): Record<string, string> {
  return Object.fromEntries(rankedCategories.map((c, i) => [c, `var(--chart-${(i % 10) + 1})`]))
}

export const OTHER_COLOR = 'hsl(var(--muted-foreground) / 0.5)'
