/*
 * Geometry of the glass (ENG-72, round 3): a liquid-glass lens, baked once.
 * Pure helpers shared by the baker (lib/glass/bake.ts) and the tests.
 *
 * The look: the middle is clear-ish (a moderate frost, FROST_BLUR), and a
 * narrow band along the rounded edge acts as a lens: it bends what is just
 * outside the element in toward the rim, strongly at the very edge and not
 * at all past the band. The band's slope tilts the surface normal, which
 * also places a thin specular highlight on the top-left rim and a fainter
 * one opposite.
 */

/** The frost, as the standard deviation of a CSS blur(), in CSS px. Tunable (the owner asked for "a bit more frosted"). */
export const FROST_BLUR = 8

/** The blur runs at this many texels per CSS px (the result is smooth). */
export const BLUR_TEXELS_PER_PX = 0.5

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface LensParams {
  /** Width of the bending band along the edge, CSS px */
  band: number
  /** How far the very edge looks outward, CSS px */
  reach: number
}

/** The lens for an element of this size: a band about 7% of the short side (10-20px), reaching 80% of it. */
export function lensParams(width: number, height: number): LensParams {
  const short = Math.max(1, Math.min(width, height))
  const band = Math.min(20, Math.max(6, short * 0.07))
  return { band, reach: band * 0.8 }
}

/**
 * How much of the lens is at inset `e` (px in from the edge): 1 at the edge,
 * 0 from `band` inward, easing (smoothstep) in between.
 */
export function edgeFactor(e: number, band: number): number {
  if (band <= 0) return 0
  const t = Math.min(1, Math.max(0, e / band))
  return 1 - t * t * (3 - 2 * t)
}

/** How far (px, outward) the lens looks at inset `e`: grows with the square of the edge factor. */
export function lensOffset(e: number, p: LensParams): number {
  const f = edgeFactor(e, p.band)
  return p.reach * f * f
}

/** What the bake must paint around the element: the lens's reach plus three standard deviations of frost. */
export function bakeMargin(p: LensParams, blur = FROST_BLUR): number {
  return Math.ceil(p.reach + 3 * blur + 2)
}

export function bakeRegion(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin }
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
 * (The element is clipped by its CSS border radius, so the lens follows that shape.)
 */
export function roundedRectDistance(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r
  const qy = Math.abs(y) - hh + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * Pixels per CSS px for a bake: the device pixel ratio up to 3 (as sharp as
 * the page on a phone), shrunk only to stay within the GPU's texture limit.
 */
export function bakeScale(region: Rect, devicePixelRatio: number, maxTextureSize: number): number {
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

/** Schlick's approximation of Fresnel reflectance for a surface whose normal makes cos θ with the view. */
export function fresnelSchlick(cosTheta: number, f0 = 0.04): number {
  const c = Math.min(1, Math.max(0, cosTheta))
  return f0 + (1 - f0) * Math.pow(1 - c, 5)
}

/** A key that changes whenever a bake would look different (rounded to half a px). */
export function bakeKey(parts: { rect: Rect; scale: number; dpr: number; theme: string; background: string }): string {
  const r = (n: number) => Math.round(n * 2) / 2
  const { rect } = parts
  return `${r(rect.x)},${r(rect.y)},${r(rect.width)},${r(rect.height)}|${parts.scale.toFixed(3)}|${parts.dpr}|${parts.theme}|${parts.background}`
}
