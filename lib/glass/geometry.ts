/*
 * Geometry of the frosted glass (ENG-72, round 2). Pure helpers, shared by
 * the WebGL renderer (lib/glass/renderer.ts), its runtime
 * (components/glass/glass-runtime.ts) and the tests.
 *
 * The look: frosted acrylic. What is behind the element is blurred strongly
 * (FROST_BLUR, about CSS blur(16px)), tinted milky, with a thin edge (a
 * RIM_BEVEL px bevel that bends the frost a little, never sampling outside
 * the element) and a 1-2px bright rim, brightest along the top-left edges.
 */

/** Strength of the frost, as the standard deviation of a CSS blur(), in CSS px. Tunable. */
export const FROST_BLUR = 16

/** Width of the thin bevel along the edge, CSS px */
export const RIM_BEVEL = 4

/** How far the bevel bends the frost toward the middle at the very edge, CSS px */
export const RIM_BEND = 3

/** The blur runs at this many texels per CSS px (the result is smooth, so a quarter is plenty). */
export const BLUR_TEXELS_PER_PX = 0.25

/** Extra room around the element the texture covers, so it is reused while the page scrolls a little. */
export const REGION_SLACK = { x: 32, y: 240 } as const

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A computed border radius ("18px", "6.4% 10.15%", "22.9px 22.9px") in px for
 * an element of this size. Elliptical corners use the smaller of the two.
 */
export function resolveRadius(computed: string | null | undefined, width: number, height: number): number {
  if (!computed) return 0
  const parts = computed.trim().split(/\s+/).slice(0, 2)
  const px = parts.map((part, i) => {
    const n = parseFloat(part)
    if (!Number.isFinite(n)) return 0
    if (part.endsWith('%')) return (n / 100) * (i === 0 ? width : height)
    return n
  })
  const r = px.length === 2 ? Math.min(px[0], px[1]) : px[0]
  return Math.max(0, Math.min(r, width / 2, height / 2))
}

/**
 * Signed distance from a point (relative to the centre) to a rounded
 * rectangle with half-size (hw, hh) and corner radius r: negative inside.
 */
export function roundedRectDistance(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r
  const qy = Math.abs(y) - hh + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/** The blur must see this far past the element: three standard deviations. */
export function frostMargin(blur = FROST_BLUR): number {
  return Math.ceil(blur * 3)
}

/** Whether `outer` contains `inner` entirely. */
export function covers(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** What the frost needs to see of the page for an element at `box` (viewport CSS px). */
export function neededRegion(box: Rect, blur = FROST_BLUR): Rect {
  const m = frostMargin(blur)
  return { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m }
}

/**
 * The region to paint for an element: what it needs plus some slack (the
 * page mostly scrolls vertically), so small scrolls reuse the texture.
 */
export function paintRegion(box: Rect, blur = FROST_BLUR, slack = REGION_SLACK): Rect {
  const n = neededRegion(box, blur)
  return { x: n.x - slack.x, y: n.y - slack.y, width: n.width + 2 * slack.x, height: n.height + 2 * slack.y }
}

/**
 * Texels per CSS px for the painted region: the device pixel ratio (up to 3,
 * so a phone's background is as sharp as the page), shrunk only if the
 * region would pass the GPU's texture limit.
 */
export function paintScale(region: Rect, devicePixelRatio: number, maxTextureSize: number): number {
  const want = Math.min(3, Math.max(1, devicePixelRatio || 1))
  const fit = Math.min(maxTextureSize / region.width, maxTextureSize / region.height)
  return Math.max(0.25, Math.min(want, fit))
}

/**
 * Normalised Gaussian weights for a separable blur with this standard
 * deviation (in texels), from the centre tap outward (3σ each side).
 */
export function gaussianWeights(sigma: number): number[] {
  const s = Math.max(0.5, sigma)
  const radius = Math.ceil(3 * s)
  const w: number[] = []
  for (let i = 0; i <= radius; i++) w.push(Math.exp(-(i * i) / (2 * s * s)))
  const total = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0)
  return w.map(x => x / total)
}

/**
 * How far the thin bevel bends the frost toward the middle at inset `e`
 * (px in from the edge): RIM_BEND at the edge, easing to 0 at RIM_BEVEL.
 */
export function rimBend(e: number, bevel = RIM_BEVEL, bend = RIM_BEND): number {
  if (e >= bevel || bevel <= 0) return 0
  const t = 1 - Math.max(0, e) / bevel
  return bend * t * t
}

/**
 * Where the frost is sampled for a point of the element (local CSS px), bent
 * at the rim and clamped inside the element, so the edge never shows the
 * page beyond it.
 */
export function rimSample(
  local: { x: number; y: number },
  inward: { x: number; y: number },
  e: number,
  size: { width: number; height: number }
): { x: number; y: number } {
  const b = rimBend(e)
  const x = local.x + inward.x * b
  const y = local.y + inward.y * b
  return { x: Math.min(size.width - 1, Math.max(1, x)), y: Math.min(size.height - 1, Math.max(1, y)) }
}
