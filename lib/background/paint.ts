/*
 * Paints the page background (ENG-72) into a 2D canvas, the same composition
 * the page shows (lib/background/tile-svg.ts on <html>), so a glass element
 * can bake what is behind it (components/glass). Browser only (Path2D).
 *
 * `region` is in document CSS px (the tile is anchored at the document's top
 * left and scrolls with it); the canvas gets `scale` pixels per CSS px.
 */

import { LINES_TILE } from './lines-tile.data'
import { LINE_WIDTH, TILE_HEIGHT, TILE_WIDTH } from './lines'
import { RIBBONS, RIBBON_BAND, RIBBON_BLUR, RIBBON_BOX, RIBBON_GRADIENTS } from './ribbons'
import { lineOpacity, paletteColors, type BackgroundSetting } from './setting'
import { TOPO_PATHS, WAVE_CRESTS } from './wallpapers.data'
import { TOPO_TILE, WAVES_BOX } from './wallpaper-gen'
import {
  AURORA,
  BUBBLES,
  BUBBLES_TILE,
  BUBBLE_COLORS,
  BUBBLE_STOPS,
  DOTS,
  DOT_FADE,
  DOT_GRID,
  GLOW_STOPS,
  GRID,
  GRID_TILE,
  GRID_WASH,
  SUNRISE,
  TOPO,
  TOPO_WIDTH,
  WAVES,
  WAVE_FOOT,
  bubbleCopies,
  hsla,
  hslHex,
  isWallpaper,
  waveBandPath,
  wallpaperBase,
  type Glow,
  type Hsl,
  type WallpaperKind,
} from './wallpapers'

export interface PaintRegion {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/** Where the page is: its width (the ribbons fill it) and, for the backgrounds fixed to the viewport, the scroll and viewport height. */
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

/** The page colour under any background (the glass works out the pattern against it). */
export function pageColor(setting: BackgroundSetting, dark: boolean): string | null {
  if (setting.kind === 'lines') return dark ? PAGE_COLOR.lines.dark : PAGE_COLOR.lines.light
  if (setting.kind === 'ribbons') return dark ? PAGE_COLOR.ribbons.dark : PAGE_COLOR.ribbons.light
  if (isWallpaper(setting.kind)) return hslHex(wallpaperBase(setting.kind, dark ? 'dark' : 'light'))
  return null
}

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

// ── The wallpapers (lib/background/wallpapers.ts) ──────────────────────

/** A glow (an ellipse at cx, cy with radii rx, ry, in CSS px), stops as in glowCss. */
function paintGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: Hsl, alpha: number) {
  if (rx <= 0 || ry <= 0) return
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(rx, ry)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  for (const [at, share] of GLOW_STOPS) g.addColorStop(at, hsla(color, alpha * share))
  ctx.fillStyle = g
  ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
}

/** A glow whose place and size are fractions of the viewport (the fixed wallpapers). */
function paintViewportGlow(ctx: CanvasRenderingContext2D, g: Glow, page: PageGeometry) {
  const vh = page.viewportHeight
  paintGlow(ctx, g.x * page.width, page.scrollY + g.y * vh, g.rx * page.width, g.ry * vh, g.color, g.alpha)
}

/** Replays SVG path data (M, C, L, Z) on the context, under its current transform. */
function tracePath(ctx: CanvasRenderingContext2D, d: string) {
  for (const [, cmd, args] of d.matchAll(/([MCLZ])([^MCLZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : []
    if (cmd === 'M') ctx.moveTo(n[0], n[1])
    else if (cmd === 'L') ctx.lineTo(n[0], n[1])
    else if (cmd === 'C') for (let i = 0; i + 5 < n.length; i += 6) ctx.bezierCurveTo(n[i], n[i + 1], n[i + 2], n[i + 3], n[i + 4], n[i + 5])
    else ctx.closePath()
  }
}

/** The fixed wallpapers: where the viewport is now (they do not scroll with the page). */
function paintFixedWallpaper(ctx: CanvasRenderingContext2D, kind: WallpaperKind, region: PaintRegion, page: PageGeometry, dark: boolean) {
  const mode = dark ? 'dark' : 'light'
  const base = wallpaperBase(kind, mode)
  ctx.fillStyle = hsla(base)
  ctx.fillRect(region.x, region.y, region.width, region.height)
  const top = page.scrollY
  const vw = page.width
  const vh = page.viewportHeight
  if (kind === 'aurora' || kind === 'sunrise') {
    for (const g of (kind === 'aurora' ? AURORA : SUNRISE)[mode].glows) paintViewportGlow(ctx, g, page)
    return
  }
  if (kind === 'dots') {
    const d = DOTS[mode]
    const { gap, ox, oy, r, soft } = DOT_GRID
    ctx.fillStyle = hsla(d.dot, d.alpha)
    const radius = (r + soft) / 2
    ctx.beginPath()
    for (let x = Math.floor((region.x - ox) / gap) * gap + ox; x < region.x + region.width + gap; x += gap) {
      for (let y = Math.floor((region.y - top - oy) / gap) * gap + oy + top; y < region.y + region.height + gap; y += gap) {
        ctx.moveTo(x + radius, y)
        ctx.arc(x, y, radius, 0, Math.PI * 2)
      }
    }
    ctx.fill()
    // The fade: the page colour over the dots, clear at the ellipse's centre, opaque past its rim
    const cx = DOT_FADE.x * vw
    const cy = top + DOT_FADE.y * vh
    const rx = DOT_FADE.rx * vw
    const ry = DOT_FADE.ry * vh
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(rx, ry)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    for (const [at, a] of DOT_FADE.stops) g.addColorStop(at, hsla(base, a))
    ctx.fillStyle = g
    ctx.fillRect((region.x - cx) / rx - 1, (region.y - cy) / ry - 1, region.width / rx + 2, region.height / ry + 2)
    ctx.restore()
    paintViewportGlow(ctx, d.tint, page)
    return
  }
  // The waves: the 300 × 620 box stretched over the viewport, hairlines one px wide
  const w = WAVES[mode]
  const sx = vw / WAVES_BOX.width
  const sy = vh / WAVES_BOX.height
  w.bands.forEach(([c, a, from], i) => {
    ctx.save()
    ctx.translate(0, top)
    ctx.scale(sx, sy)
    const g = ctx.createLinearGradient(0, from, 0, WAVES_BOX.height)
    g.addColorStop(0, hsla(c, a))
    g.addColorStop(1, hsla(c, a * WAVE_FOOT))
    ctx.fillStyle = g
    ctx.beginPath()
    tracePath(ctx, waveBandPath(i))
    ctx.fill()
    ctx.restore()
  })
  ctx.strokeStyle = hsla(w.edge, w.edgeAlpha)
  ctx.lineWidth = 1
  for (const d of WAVE_CRESTS) {
    ctx.save()
    ctx.translate(0, top)
    ctx.scale(sx, sy)
    ctx.beginPath()
    tracePath(ctx, d)
    ctx.restore()
    ctx.stroke()
  }
}

let topoPaths: Path2D[] | null = null

/** Calls `draw` translated to every tile (w × h, anchored at the document's top left) that meets the region, clipped to it. */
function eachTile(ctx: CanvasRenderingContext2D, region: PaintRegion, w: number, h: number, draw: () => void) {
  for (let tx = Math.floor(region.x / w); tx * w < region.x + region.width; tx++) {
    for (let ty = Math.floor(region.y / h); ty * h < region.y + region.height; ty++) {
      ctx.save()
      ctx.translate(tx * w, ty * h)
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.clip()
      draw()
      ctx.restore()
    }
  }
}

/** The tiled wallpapers: they scroll with the document. */
function paintTiledWallpaper(ctx: CanvasRenderingContext2D, kind: WallpaperKind, region: PaintRegion, page: PageGeometry, dark: boolean) {
  const mode = dark ? 'dark' : 'light'
  ctx.fillStyle = hsla(wallpaperBase(kind, mode))
  ctx.fillRect(region.x, region.y, region.width, region.height)
  if (kind === 'topo') {
    const t = TOPO[mode]
    if (!topoPaths) topoPaths = TOPO_PATHS.map(p => new Path2D(p.d))
    const list = topoPaths
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    eachTile(ctx, region, TOPO_TILE.width, TOPO_TILE.height, () => {
      for (const major of [false, true]) {
        ctx.strokeStyle = hsla(t.line, major ? t.major : t.minor)
        ctx.lineWidth = major ? TOPO_WIDTH.major : TOPO_WIDTH.minor
        TOPO_PATHS.forEach((p, i) => {
          if (p.major === major) ctx.stroke(list[i])
        })
      }
    })
    return
  }
  if (kind === 'grid') {
    const g = GRID[mode]
    const { size, step } = GRID_TILE
    // The wash, in its layer at the top of the document (100% × GRID_WASH.ry), under the grid's
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, page.width, GRID_WASH.ry)
    ctx.clip()
    paintGlow(ctx, GRID_WASH.x * page.width, 0, GRID_WASH.rx, GRID_WASH.ry, g.wash, g.washAlpha)
    ctx.restore()
    ctx.lineWidth = 1
    for (const major of [false, true]) {
      ctx.strokeStyle = hsla(g.line, major ? g.major : g.minor)
      ctx.beginPath()
      for (let x = Math.floor(region.x / step) * step; x <= region.x + region.width; x += step) {
        if ((x % size === 0) !== major) continue
        ctx.moveTo(x + 0.5, region.y)
        ctx.lineTo(x + 0.5, region.y + region.height)
      }
      for (let y = Math.floor(region.y / step) * step; y <= region.y + region.height; y += step) {
        if ((y % size === 0) !== major) continue
        ctx.moveTo(region.x, y + 0.5)
        ctx.lineTo(region.x + region.width, y + 0.5)
      }
      ctx.stroke()
    }
    return
  }
  // Bubbles
  const b = BUBBLE_COLORS[mode]
  eachTile(ctx, region, BUBBLES_TILE.width, BUBBLES_TILE.height, () => {
    for (const [x, y, r, ci] of BUBBLES) {
      for (const [dx, dy] of bubbleCopies(x, y, r)) {
        const cx = x + dx
        const cy = y + dy
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        for (const [at, share] of BUBBLE_STOPS) g.addColorStop(at, hsla(b.colors[ci], b.alpha * share))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
}

function paintWallpaper(ctx: CanvasRenderingContext2D, kind: WallpaperKind, region: PaintRegion, page: PageGeometry, dark: boolean) {
  if (kind === 'topo' || kind === 'grid' || kind === 'bubbles') paintTiledWallpaper(ctx, kind, region, page, dark)
  else paintFixedWallpaper(ctx, kind, region, page, dark)
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
  else if (isWallpaper(setting.kind)) paintWallpaper(ctx, setting.kind, region, page, dark)
  else paintPlain(ctx, page, dark)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
