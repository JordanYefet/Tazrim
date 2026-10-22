/*
 * Which glass an element gets (ENG-72, round 3).
 *
 *   baked   large elements (a hero, the front wallet card, the add / edit
 *           preview): the liquid-glass lens, baked once into a canvas
 *           (lib/glass/bake.ts; WebGL2, or Canvas2D without it)
 *   static  small elements (pills, mini faces, rows, wallet strips, pickers):
 *           a tint, a thin rim and an inner highlight in CSS, no blur
 *   solid   an opaque surface: reduced transparency or more contrast asked for
 */

export type GlassRenderer = 'baked' | 'static' | 'solid'

export interface GlassEnvironment {
  /** The element is large enough for the baked lens */
  baked: boolean
  /** prefers-reduced-transparency: reduce */
  reducedTransparency: boolean
  /** prefers-contrast: more */
  moreContrast: boolean
}

export function decideGlassRenderer(env: GlassEnvironment): GlassRenderer {
  if (env.reducedTransparency || env.moreContrast) return 'solid'
  return env.baked ? 'baked' : 'static'
}
