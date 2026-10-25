/*
 * The account faces under a glass element (ENG-81): in the wallet's stack a
 * glass card lies over the cards behind it, so its bake paints them into
 * the background it frosts (lib/glass/bake.ts). A face is drawn from its
 * colours alone (--face-a / -b / -c), with the gradients of .acct-card__field
 * (app/globals.css); its text and wordmark are left out, the frost would
 * blur them away anyway.
 */

import type { Rect } from './geometry'

export interface UnderFace {
  /** On the document, on screen (CSS px) */
  rect: Rect
  /** Corner radius on screen (CSS px) */
  radius: number
  /** --face-a (glow), --face-b (base), --face-c (deep), as CSS colours */
  colors: [string, string, string]
}

/**
 * Where a CSS linear-gradient at `angleDeg` starts and ends in a box: through
 * its centre, long enough that the corners get the first and last stops.
 */
export function cssGradientLine(angleDeg: number, rect: Rect): { x0: number; y0: number; x1: number; y1: number } {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = (Math.abs(rect.width * dx) + Math.abs(rect.height * dy)) / 2
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half }
}

/**
 * What identifies the faces under an element for its cache key: each face's
 * place relative to the element (so the whole stack moving keeps the key)
 * and its colours.
 */
export function underSignature(under: UnderFace[] | undefined, at: Rect): string {
  if (!under?.length) return ''
  const r = (n: number) => Math.round(n)
  return under
    .map(f => `${r(f.rect.x - at.x)},${r(f.rect.y - at.y)},${r(f.rect.width)}x${r(f.rect.height)},${f.colors.join('/')}`)
    .join(';')
}

/** Whether a face's rect reaches into `region` at all. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** [r, g, b] (0-255) of a canvas colour as the canvas normalises it ("#rrggbb" or "rgba(r, g, b, a)"). */
export function parseCanvasColor(normalised: string): [number, number, number] {
  if (normalised.startsWith('#') && normalised.length === 7) {
    const n = parseInt(normalised.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const m = normalised.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
}

/** `color` at `alpha`, and fully transparent in the same colour (so a gradient between them never greys). */
function alphaPair(ctx: CanvasRenderingContext2D, color: string, alpha: number): [string, string] {
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  const [r, g, b] = parseCanvasColor(String(ctx.fillStyle))
  return [`rgba(${r},${g},${b},${alpha})`, `rgba(${r},${g},${b},0)`]
}

/** An elliptical radial gradient (CSS `rx ry at cx cy`) from `inner` to transparent at `stop`. */
function ellipseGlow(ctx: CanvasRenderingContext2D, f: UnderFace, cx: number, cy: number, rx: number, ry: number, color: string, alpha: number, stop: number) {
  const [inner, outer] = alphaPair(ctx, color, alpha)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  g.addColorStop(0, inner)
  g.addColorStop(stop, outer)
  ctx.fillStyle = g
  // The face is clipped already: cover it in the scaled space
  ctx.fillRect(-(cx - f.rect.x) / rx, -(cy - f.rect.y) / ry, f.rect.width / rx, f.rect.height / ry)
  ctx.restore()
}

/**
 * Paints `faces` (back to front) into a context whose transform maps
 * document CSS px, under a soft shadow like the cards' own.
 */
export function paintUnderFaces(ctx: CanvasRenderingContext2D, faces: UnderFace[], dark: boolean) {
  for (const f of faces) {
    const { x, y, width: w, height: h } = f.rect
    const [a, b, c] = f.colors
    ctx.save()
    // The card's shadow on what is behind it
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.22)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, f.radius)
    ctx.fillStyle = c
    ctx.fill()
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, f.radius)
    ctx.clip()
    // linear-gradient(158deg, b 0%, c 78%)
    const line = cssGradientLine(158, f.rect)
    const base = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1)
    base.addColorStop(0, b)
    base.addColorStop(0.78, c)
    base.addColorStop(1, c)
    ctx.fillStyle = base
    ctx.fillRect(x, y, w, h)
    // radial-gradient(90% 125% at 100% 0%, a 66%, transparent 58%)
    ellipseGlow(ctx, f, x + w, y, 0.9 * w, 1.25 * h, a, 0.66, 0.58)
    // radial-gradient(75% 110% at 0% 100%, a 20%, transparent 62%)
    ellipseGlow(ctx, f, x, y + h, 0.75 * w, 1.1 * h, a, 0.2, 0.62)
    ctx.restore()
  }
}
