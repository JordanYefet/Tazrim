/*
 * Paints the page background (ENG-72) into a 2D canvas: the same composition
 * the page shows (components/background/background-layer.tsx), so the glass
 * slab (lib/glass/renderer.ts) can refract it. Browser only (Path2D).
 *
 * The canvas covers `region` of the viewport (viewport CSS px) at `scale`
 * canvas pixels per CSS px. The page's background layer is fixed to the
 * viewport, with the lines tile anchored at its top-left corner.
 */

import { LINES_TILE } from './lines-tile.data'
import { LINE_WIDTH, TILE_HEIGHT, TILE_WIDTH } from './lines'
import { RIBBONS, RIBBON_BLEED, RIBBON_BLUR, RIBBON_BOX, RIBBON_GRADIENTS } from './ribbons'
import { lineOpacity, paletteColors, type BackgroundSetting } from './setting'

export interface PaintRegion {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/** The page colour under each pattern (the stylesheet's --page-backdrop for lines / ribbons). */
export const PAGE_COLOR = {
  lines: { light: '#ffffff', dark: '#0b1120' },
  ribbons: { light: '#eef2f7', dark: '#05060f' },
} as const

let paths: Path2D[] | null = null
function tilePaths(): Path2D[] {
  if (!paths) paths = LINES_TILE.map(p => new Path2D(p.d))
  return paths
}

function paintPlain(ctx: CanvasRenderingContext2D, vw: number, vh: number, dark: boolean) {
  const lin = ctx.createLinearGradient(0, 0, 0, vh)
  lin.addColorStop(0, dark ? 'hsl(221,30%,9.5%)' : 'hsl(210,32%,97%)')
  lin.addColorStop(1, dark ? 'hsl(224,32%,7%)' : 'hsl(214,26%,93.5%)')
  ctx.fillStyle = lin
  ctx.fillRect(-4000, -4000, 8000 + vw, 8000 + vh)
  // The two soft glows of --page-backdrop: ellipses 64rem × 30rem and 50rem × 36rem
  const glow = (cx: number, cy: number, rx: number, ry: number, color: string) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(rx, ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, color)
    g.addColorStop(0.7, color.replace(/[\d.]+\)$/, '0)'))
    ctx.fillStyle = g
    ctx.fillRect(-1, -1, 2, 2)
    ctx.restore()
  }
  glow(vw * 0.7, -128, 1024, 480, dark ? 'hsla(204,65%,26%,0.3)' : 'hsla(199,75%,86%,0.5)')
  glow(0, vh * 1.05, 800, 576, dark ? 'hsla(234,45%,20%,0.35)' : 'hsla(224,50%,86%,0.45)')
}

function paintLines(ctx: CanvasRenderingContext2D, region: PaintRegion, setting: BackgroundSetting, dark: boolean) {
  ctx.fillStyle = dark ? PAGE_COLOR.lines.dark : PAGE_COLOR.lines.light
  ctx.fillRect(region.x, region.y, region.width, region.height)
  const colors = paletteColors(setting.palette, dark)
  ctx.lineWidth = LINE_WIDTH
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = lineOpacity(setting)
  const list = tilePaths()
  for (let tx = Math.floor(region.x / TILE_WIDTH); tx * TILE_WIDTH < region.x + region.width; tx++) {
    for (let ty = Math.floor(region.y / TILE_HEIGHT); ty * TILE_HEIGHT < region.y + region.height; ty++) {
      ctx.save()
      ctx.translate(tx * TILE_WIDTH, ty * TILE_HEIGHT)
      ctx.beginPath()
      ctx.rect(0, 0, TILE_WIDTH, TILE_HEIGHT)
      ctx.clip()
      LINES_TILE.forEach((p, i) => {
        ctx.strokeStyle = colors[p.color]
        for (const [dx, dy] of p.copies) {
          ctx.save()
          ctx.translate(dx, dy)
          ctx.stroke(list[i])
          ctx.restore()
        }
      })
      ctx.restore()
    }
  }
  ctx.globalAlpha = 1
}

function supportsCanvasFilter(ctx: CanvasRenderingContext2D): boolean {
  if (!('filter' in ctx)) return false
  const before = ctx.filter
  ctx.filter = 'blur(1px)'
  const ok = ctx.filter === 'blur(1px)'
  ctx.filter = before
  return ok
}

function drawRibbons(ctx: CanvasRenderingContext2D, vw: number, vh: number, dark: boolean) {
  // The layer reaches RIBBON_BLEED px past the viewport on every side
  const sx = (vw + 2 * RIBBON_BLEED) / RIBBON_BOX.width
  const sy = (vh + 2 * RIBBON_BLEED) / RIBBON_BOX.height
  const stops = dark ? RIBBON_GRADIENTS.dark : RIBBON_GRADIENTS.light
  ctx.save()
  ctx.translate(-RIBBON_BLEED, -RIBBON_BLEED)
  ctx.scale(sx, sy)
  for (const [d, gi, opLight, opDark] of RIBBONS) {
    const g = ctx.createLinearGradient(0, 0, RIBBON_BOX.width, 0)
    g.addColorStop(0, stops[gi][0])
    g.addColorStop(1, stops[gi][1])
    ctx.fillStyle = g
    ctx.globalAlpha = dark ? opDark : opLight
    ctx.fill(new Path2D(d))
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function paintRibbons(ctx: CanvasRenderingContext2D, region: PaintRegion, vw: number, vh: number, dark: boolean) {
  if (dark) {
    // radial-gradient(120% 80% at 80% 0%, #12163a 0%, #05060f 70%)
    ctx.fillStyle = PAGE_COLOR.ribbons.dark
    ctx.fillRect(region.x, region.y, region.width, region.height)
    ctx.save()
    ctx.translate(vw * 0.8, 0)
    ctx.scale(vw * 1.2, vh * 0.8)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, '#12163a')
    g.addColorStop(0.7, '#05060f')
    ctx.fillStyle = g
    ctx.fillRect(-2, -2, 4, 4)
    ctx.restore()
  } else {
    ctx.fillStyle = PAGE_COLOR.ribbons.light
    ctx.fillRect(region.x, region.y, region.width, region.height)
  }
  const blur = dark ? RIBBON_BLUR.dark : RIBBON_BLUR.light
  if (supportsCanvasFilter(ctx)) {
    ctx.filter = `blur(${blur * region.scale}px)`
    drawRibbons(ctx, vw, vh, dark)
    ctx.filter = 'none'
    return
  }
  // No canvas filter (Safari): draw small and scale up; the upscale softens
  // the ribbons about as much as the page's blur does
  const k = 1 / blur
  const small = document.createElement('canvas')
  small.width = Math.max(2, Math.ceil(vw * k) + 2)
  small.height = Math.max(2, Math.ceil(vh * k) + 2)
  const sctx = small.getContext('2d')
  if (!sctx) return
  sctx.scale(k, k)
  drawRibbons(sctx, vw, vh, dark)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, small.width / k, small.height / k)
}

/**
 * Paints the background for `setting` into `canvas`, sized to the region.
 * `viewport` is the size of the page's fixed background layer.
 */
export function paintBackground(
  canvas: HTMLCanvasElement,
  setting: BackgroundSetting,
  dark: boolean,
  region: PaintRegion,
  viewport: { width: number; height: number }
) {
  const w = Math.max(1, Math.round(region.width * region.scale))
  const h = Math.max(1, Math.round(region.height * region.scale))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(region.scale, 0, 0, region.scale, -region.x * region.scale, -region.y * region.scale)
  if (setting.kind === 'lines') paintLines(ctx, region, setting, dark)
  else if (setting.kind === 'ribbons') paintRibbons(ctx, region, viewport.width, viewport.height, dark)
  else paintPlain(ctx, viewport.width, viewport.height, dark)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
