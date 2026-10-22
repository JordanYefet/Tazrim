/*
 * Geometry of the glass slab (ENG-72). The WebGL shader
 * (lib/glass/renderer.ts) does the same maths per pixel; these TypeScript
 * twins choose its parameters and are unit-tested, so the optics can be
 * checked without a GPU.
 *
 * The slab: a flat plate the shape of the element (a rounded rectangle with
 * the element's radius), `thickness` px thick, with a rounded bevel `bevel`
 * px wide along its edges, floating `lift` px above the page. Seen from
 * straight above, a ray refracts into the top face, crosses the glass,
 * refracts out of the flat bottom and lands on the page. Where the top is
 * flat the ray goes straight through (a faint dome gives a slight
 * magnification); on the bevel it bends strongly toward the middle.
 */

export interface SlabParams {
  /** Corner radius, px */
  radius: number
  /** Width of the rounded bevel along the edge, px */
  bevel: number
  /** Glass thickness at the flat top, px */
  thickness: number
  /** Height of the slab's underside above the page, px */
  lift: number
}

/** How much the flat middle magnifies (a faint dome on the top face). */
export const MAGNIFICATION = 0.04

/**
 * The dome's tilt per px from the centre that shifts what is seen by
 * MAGNIFICATION × the distance from the centre: a ray tilted by a small
 * angle a lands a·(1 − 1/n)·(thickness + n·lift) px away.
 */
export function domeTilt(p: SlabParams, ior: number, magnification = MAGNIFICATION): number {
  const reach = (1 - 1 / ior) * (p.thickness + ior * p.lift)
  return magnification / Math.max(1, reach)
}

/** Parameters for an element of this size: the bevel and depth grow with it, within limits. */
export function slabParams(width: number, height: number, radius: number): SlabParams {
  const short = Math.max(1, Math.min(width, height))
  return {
    radius: Math.min(radius, short / 2),
    bevel: Math.min(34, Math.max(6, short * 0.13)),
    thickness: Math.min(24, Math.max(6, short * 0.09)),
    lift: Math.min(14, Math.max(4, short * 0.05)),
  }
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

/**
 * Height of the slab's top at inset `e` (distance in from the edge) and the
 * slope dh/de: a quarter-round bevel that meets the flat top smoothly. The
 * slope is capped just short of vertical so the rim stays finite.
 */
export function bevelProfile(e: number, p: SlabParams): { height: number; slope: number } {
  if (e >= p.bevel) return { height: p.thickness, slope: 0 }
  const s = Math.min(0.985, Math.max(0, 1 - e / p.bevel))
  const root = Math.sqrt(1 - s * s)
  return { height: p.thickness * root, slope: (p.thickness * s) / (p.bevel * root) }
}

type Vec3 = [number, number, number]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** GLSL's refract(): null on total internal reflection. */
export function refract(i: Vec3, n: Vec3, eta: number): Vec3 | null {
  const cosi = dot(n, i)
  const k = 1 - eta * eta * (1 - cosi * cosi)
  if (k < 0) return null
  const f = eta * cosi + Math.sqrt(k)
  return [eta * i[0] - f * n[0], eta * i[1] - f * n[1], eta * i[2] - f * n[2]]
}

/**
 * Where on the page a straight-down view ray lands after crossing the slab,
 * as an offset (px) from the point right below. `outward` is the unit vector
 * toward the nearest edge at this point; `fromCentre` the point's offset (px)
 * from the centre (for the dome).
 */
export function slabDisplacement(
  e: number,
  outward: [number, number],
  fromCentre: [number, number],
  p: SlabParams,
  ior: number
): [number, number] {
  const { height, slope } = bevelProfile(e, p)
  // Top surface normal: the bevel tilts it outward, the dome a little too
  const tilt = domeTilt(p, ior)
  const gx = slope * outward[0] + tilt * fromCentre[0]
  const gy = slope * outward[1] + tilt * fromCentre[1]
  const n = normalize([gx, gy, 1])
  const down: Vec3 = [0, 0, -1]
  const inside = refract(down, n, 1 / ior) ?? down
  const t1 = -height / Math.min(-0.05, inside[2])
  // Out through the flat underside (its normal faces up, against the ray)
  const out = refract(normalize(inside), [0, 0, 1], ior)
  const exit = out ?? normalize(inside)
  const t2 = -p.lift / Math.min(-0.05, exit[2])
  return [inside[0] * t1 + exit[0] * t2, inside[1] * t1 + exit[1] * t2]
}

/**
 * The region of the viewport the background texture covers: the viewport
 * plus a margin (rays near the edge sample a little outside it), at a scale
 * that keeps it within the GPU's texture limit.
 */
export function textureRegion(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
  maxTextureSize: number,
  margin = 48
): { x: number; y: number; width: number; height: number; scale: number } {
  const width = viewportWidth + margin * 2
  const height = viewportHeight + margin * 2
  let scale = Math.min(1.5, Math.max(1, devicePixelRatio))
  const fit = Math.min(maxTextureSize / width, maxTextureSize / height)
  if (scale > fit) scale = fit
  return { x: -margin, y: -margin, width, height, scale }
}
