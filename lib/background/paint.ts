/*
 * Paints the page background (ENG-72) into a 2D canvas, the same composition
 * the page shows (lib/background/tile-svg.ts on <body>), so a glass element
 * can bake what is behind it (components/glass). Browser only (Path2D).
 *
 * `region` is in document CSS px (the tile is anchored at the document's top
 * left and scrolls with it); the canvas gets `scale` pixels per CSS px.
 */

import { LINES_TILE } from './lines-tile.data'
import { LINE_WIDTH, TILE_HEIGHT, TILE_WIDTH } from './lines'
import { RIBBONS, RIBBON_BAND, RIBBON_BLUR, RIBBON_BOX, RIBBON_GRADIENTS } from './ribbons'
import { lineOpacity, paletteColors, type BackgroundSetting } from './setting'

export interface PaintRegion {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/** Where the page is: its width (the ribbons fill it) and, for the plain backdrop (fixed to the viewport), the scroll and viewport height. */
export interface PageGeometry {
  width: number
  scrollY: number
  viewportHeight: number
}

/** The page colour under each pattern (html background in the stylesheet). */
export const PAGE_COLOR = {
  lines: { light: '#ffffff', dark: '#0b1120' },
  ribbons: { light: '#eef2f7', dark: '#05060f' },
} as const

let paths: Path2D[] | null = null
function tilePaths(): Path2D[] {
  if (!paths) paths = LINES_TILE.map(p => new Path2D(p.d))
  return paths
}

function paintPlain(ctx: CanvasRenderingContext2D, page: PageGeometry, dark: boolean) {
  // The tonal backdrop is fixed to the viewport: paint it where it is now
  const top = page.scrollY
  const vh = page.viewportHeight
  const lin = ctx.createLinearGradient(0, top, 0, top + vh)
  lin.addColorStop(0, dark ? 'hsl(221,30%,9.5%)' : 'hsl(210,32%,97%)')
  lin.addColorStop(1, dark ? 'hsl(224,32%,7%)' : 'hsl(214,26%,93.5%)')
  ctx.fillStyle = lin
  ctx.fillRect(-4000, top - 4000, 8000 + page.width, 8000 + vh)
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
  glow(page.width * 0.7, top - 128, 1024, 480, dark ? 'hsla(204,65%,26%,0.3)' : 'hsla(199,75%,86%,0.5)')
  glow(0, top + vh * 1.05, 800, 576, dark ? 'hsla(234,45%,20%,0.35)' : 'hsla(224,50%,86%,0.45)')
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

/** The ribbons of one tile, in tile units (390 × 640), as tile-svg.ts lays them out. */
function drawRibbonTile(ctx: CanvasRenderingContext2D, dark: boolean) {
  const stops = dark ? RIBBON_GRADIENTS.dark : RIBBON_GRADIENTS.light
  const bleed = 30
  ctx.save()
  ctx.translate(-bleed, RIBBON_BAND.y)
  ctx.scale((RIBBON_BOX.width + 2 * bleed) / RIBBON_BOX.width, RIBBON_BAND.scaleY)
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

function paintRibbons(ctx: CanvasRenderingContext2D, region: PaintRegion, page: PageGeometry, dark: boolean) {
  ctx.fillStyle = dark ? PAGE_COLOR.ribbons.dark : PAGE_COLOR.ribbons.light
  ctx.fillRect(region.x, region.y, region.width, region.height)
  // The tile is as wide as the page and repeats down it
  const k = page.width / RIBBON_BOX.width
  const tileH = RIBBON_BOX.height * k
  const blur = (dark ? RIBBON_BLUR.dark : RIBBON_BLUR.light) * k
  const first = Math.floor(region.y / tileH)
  const last = Math.floor((region.y + region.height) / tileH)
  const draw = (c: CanvasRenderingContext2D) => {
    for (let i = first - 1; i <= last + 1; i++) {
      c.save()
      c.translate(0, i * tileH)
      c.scale(k, k)
      drawRibbonTile(c, dark)
      c.restore()
    }
  }
  if (supportsCanvasFilter(ctx)) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(region.x, region.y, region.width, region.height)
    ctx.clip()
    ctx.filter = `blur(${blur * region.scale}px)`
    draw(ctx)
    ctx.filter = 'none'
    ctx.restore()
    return
  }
  // No canvas filter (Safari): draw small and scale up, about as soft as the page's blur
  const f = Math.max(1, blur / 2)
  const small = document.createElement('canvas')
  small.width = Math.max(2, Math.ceil(region.width / f))
  small.height = Math.max(2, Math.ceil(region.height / f))
  const s = small.getContext('2d')
  if (!s) return
  s.fillStyle = ctx.fillStyle as string
  s.fillRect(0, 0, small.width, small.height)
  s.scale(1 / f, 1 / f)
  s.translate(-region.x, -region.y)
  draw(s)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, region.x, region.y, small.width * f, small.height * f)
}

/** Paints the background behind `region` (document CSS px) into `canvas`. */
export function paintBackground(canvas: HTMLCanvasElement, setting: BackgroundSetting, dark: boolean, region: PaintRegion, page: PageGeometry) {
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
  else if (setting.kind === 'ribbons') paintRibbons(ctx, region, page, dark)
  else paintPlain(ctx, page, dark)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
