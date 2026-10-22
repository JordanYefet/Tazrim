/*
 * The colour glow behind a glass element (ENG-72, round 2). Frosted glass
 * over a near-white page reads as white, so a few large soft blobs in the
 * background palette's colours sit on the page under each glass element and
 * reach a little past its edges; the frost turns them into diffuse colour.
 *
 * The blobs are described relative to the element, so the WebGL slab, the
 * CSS lens and the halo outside (a coloured box-shadow) all agree.
 *
 * GLASS_GLOW switches it on or off for the whole app. For showing both
 * versions, localStorage "tazrim:glass-glow" = "0" / "1" overrides it in
 * that browser.
 */

export const GLASS_GLOW = true

export const GLOW_OVERRIDE_KEY = 'tazrim:glass-glow'

/** Glow on? The constant, unless this browser overrides it. */
export function glassGlowEnabled(override: string | null | undefined = undefined): boolean {
  if (override === '0') return false
  if (override === '1') return true
  return GLASS_GLOW
}

export interface GlowBlob {
  /** Centre, as a share of the element's width / height (may sit outside 0-1) */
  cx: number
  cy: number
  /** Radii, as a share of the element's width / height */
  rx: number
  ry: number
  /** Palette colour: 0 the first, 1 the second */
  color: 0 | 1
  /** Opacity at the centre, before the light / dark strength */
  alpha: number
}

/** Three blobs: the first colour high on the left, the second low on the right, a little more of it top right. */
export const GLOW_BLOBS: ReadonlyArray<GlowBlob> = [
  { cx: 0.18, cy: 0.22, rx: 0.62, ry: 0.85, color: 0, alpha: 1 },
  { cx: 0.88, cy: 0.86, rx: 0.58, ry: 0.85, color: 1, alpha: 0.95 },
  { cx: 0.7, cy: -0.05, rx: 0.36, ry: 0.55, color: 1, alpha: 0.5 },
]

/** Overall strength of the glow: soft on light pages, richer on dark ones. */
export const GLOW_STRENGTH = { light: 0.4, dark: 0.55 } as const

/**
 * The glow's colours: the palette's saturated pair in both modes (on a dark
 * page they read as rich colour at low lightness, mixed into dark glass).
 */
export const GLOW_COLORS = {
  'indigo-pink': ['#4f46e5', '#d946ef'],
  ocean: ['#0369a1', '#0d9488'],
  grey: ['#334155', '#64748b'],
} as const

/** Opacity of a blob at a point (element-relative 0-1 coords): a Gaussian falloff, 0 well outside its radii. */
export function blobAlpha(b: GlowBlob, u: number, v: number): number {
  const dx = (u - b.cx) / b.rx
  const dy = (v - b.cy) / b.ry
  return b.alpha * Math.exp(-2.2 * (dx * dx + dy * dy))
}

/**
 * The same blobs as CSS radial gradients (for the CSS lens), using the
 * stylesheet's --glow-a / --glow-b colours. The Gaussian is approximated by
 * fading to transparent at the blob's radius.
 */
export function glowGradients(blobs: ReadonlyArray<GlowBlob> = GLOW_BLOBS): string {
  return blobs
    .map(b => {
      const color = b.color ? 'var(--glow-b)' : 'var(--glow-a)'
      const pct = Math.round(b.alpha * 100)
      return `radial-gradient(${Math.round(b.rx * 100)}% ${Math.round(b.ry * 100)}% at ${Math.round(b.cx * 100)}% ${Math.round(b.cy * 100)}%, color-mix(in srgb, ${color} ${pct}%, transparent), transparent 100%)`
    })
    .join(', ')
}
