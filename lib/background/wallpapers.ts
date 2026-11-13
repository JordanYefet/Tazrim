/*
 * The seven wallpapers (Settings → רקע, the wallpaper mockup): their shapes,
 * colours and strengths, light and dark, in one place. The page draws them
 * from the CSS and SVG built here (lib/background/tile-svg.ts puts them on
 * <html>), and lib/background/paint.ts paints the same thing into a canvas
 * for the glass, so both always agree.
 *
 * Two mechanisms, as for the first three backgrounds:
 *   fixed  aurora, waves, dots, sunrise: a layer fixed to the viewport
 *          (body::before), like the plain backdrop. Positions and sizes
 *          are fractions of the viewport (x of its width, y of its height)
 *   tile   topo, grid, bubbles: a tile on <html> that scrolls with the
 *          document, like the lines; sizes in CSS px
 * Static only: nothing here animates.
 */

import { TOPO_PATHS, WAVE_CRESTS } from './wallpapers.data'
import { TOPO_TILE, WAVES_BOX } from './wallpaper-gen'
import type { BackgroundKind } from './setting'

export type Mode = 'light' | 'dark'
/** hue, saturation %, lightness % */
export type Hsl = readonly [number, number, number]

export type WallpaperKind = 'aurora' | 'waves' | 'topo' | 'dots' | 'sunrise' | 'grid' | 'bubbles'
export const WALLPAPER_KINDS: ReadonlyArray<WallpaperKind> = ['aurora', 'waves', 'topo', 'dots', 'sunrise', 'grid', 'bubbles']

export function isWallpaper(kind: BackgroundKind): kind is WallpaperKind {
  return (WALLPAPER_KINDS as ReadonlyArray<string>).includes(kind)
}

const r4 = (n: number) => Number(n.toFixed(4)).toString()

/** A colour CSS and canvas both read (the comma syntax: older canvases want it). */
export function hsla(c: Hsl, alpha = 1): string {
  return alpha >= 1 ? `hsl(${c[0]}, ${c[1]}%, ${c[2]}%)` : `hsla(${c[0]}, ${c[1]}%, ${c[2]}%, ${r4(alpha)})`
}

/** #rrggbb of a colour (the glass wants the page colour as numbers). */
export function hslHex(c: Hsl): string {
  const [h, s, l] = [c[0], c[1] / 100, c[2] / 100]
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`
}

/**
 * A soft elliptical glow: centre and radii as fractions of the box it
 * fills (the viewport), strongest in the middle, gone at its rim.
 */
export interface Glow {
  x: number
  y: number
  rx: number
  ry: number
  color: Hsl
  alpha: number
}

/** [offset, share of the glow's alpha] along its radius */
export const GLOW_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.45, 0.55],
  [1, 0],
]

const pct = (n: number) => `${r4(n * 100)}%`

export function glowCss(g: Glow): string {
  const stops = GLOW_STOPS.map(([at, share]) => `${hsla(g.color, g.alpha * share)} ${pct(at)}`).join(', ')
  return `radial-gradient(${pct(g.rx)} ${pct(g.ry)} at ${pct(g.x)} ${pct(g.y)}, ${stops})`
}

// ── זוהר: four glows, like the sign-in page, fixed ─────────────────────
// The dark glows behind the top are toned down so muted labels on the page stay readable
export const AURORA: Record<Mode, { base: Hsl; glows: Glow[] }> = {
  light: {
    base: [240, 30, 98],
    glows: [
      { x: 0.2333, y: 0.1452, rx: 0.8, ry: 0.3387, color: [256, 80, 88], alpha: 0.7 },
      { x: 0.9, y: 0.0645, rx: 0.6667, ry: 0.2742, color: [203, 70, 86], alpha: 0.7 },
      { x: 0.8333, y: 0.6774, rx: 0.7667, ry: 0.4032, color: [322, 70, 90], alpha: 0.63 },
      { x: 0.0667, y: 0.9677, rx: 0.7333, ry: 0.2903, color: [165, 55, 88], alpha: 0.49 },
    ],
  },
  dark: {
    base: [224, 32, 7.5],
    glows: [
      { x: 0.2333, y: 0.1452, rx: 0.8, ry: 0.3387, color: [256, 50, 32], alpha: 0.42 },
      { x: 0.9, y: 0.0645, rx: 0.6667, ry: 0.2742, color: [205, 60, 27], alpha: 0.38 },
      { x: 0.8333, y: 0.6774, rx: 0.7667, ry: 0.4032, color: [322, 42, 26], alpha: 0.54 },
      { x: 0.0667, y: 0.9677, rx: 0.7333, ry: 0.2903, color: [172, 45, 20], alpha: 0.42 },
    ],
  },
}

// ── זריחה: one warm glow from the top corner, fixed ────────────────────
export const SUNRISE: Record<Mode, { base: Hsl; glows: Glow[] }> = {
  light: {
    base: [30, 30, 98.5],
    glows: [
      { x: 1, y: -0.0645, rx: 1.5667, ry: 0.6935, color: [203, 75, 86], alpha: 0.85 },
      { x: 1.0333, y: -0.0645, rx: 1.1, ry: 0.4677, color: [22, 95, 85], alpha: 0.95 },
      { x: -0.1333, y: 1.0484, rx: 0.8667, ry: 0.3226, color: [214, 40, 90], alpha: 0.6 },
    ],
  },
  dark: {
    base: [224, 32, 7.5],
    glows: [
      { x: 1, y: -0.0645, rx: 1.4, ry: 0.6129, color: [248, 50, 34], alpha: 0.5 },
      { x: 1.1, y: -0.0968, rx: 0.7667, ry: 0.3387, color: [300, 35, 32], alpha: 0.42 },
      { x: -0.1333, y: 1.0323, rx: 0.8667, ry: 0.3226, color: [230, 40, 18], alpha: 0.5 },
    ],
  },
}

// ── נקודות: a dot grid, strongest behind the heading, fading out; fixed ──
export const DOT_GRID = {
  /** Spacing, CSS px */
  gap: 16,
  /** The first dot's centre in its cell */
  ox: 6,
  oy: 8,
  /** Solid to `r`, soft to `soft` (CSS px) */
  r: 1.25,
  soft: 1.75,
} as const

/**
 * Where the dots fade out: a layer of the page colour over them, clear at
 * this ellipse's centre and opaque at its rim (1 − smoothstep, sampled).
 */
export const DOT_FADE = {
  x: 0.55,
  y: 0.1452,
  rx: 0.62,
  ry: 0.7742,
  stops: [
    [0, 0],
    [0.2, 0.104],
    [0.4, 0.352],
    [0.6, 0.648],
    [0.8, 0.896],
    [1, 1],
  ] as ReadonlyArray<readonly [number, number]>,
}

export const DOTS: Record<Mode, { base: Hsl; dot: Hsl; alpha: number; tint: Glow }> = {
  light: { base: [210, 30, 98], dot: [214, 35, 25], alpha: 0.34, tint: { x: 0.6, y: 0.0968, rx: 0.8667, ry: 0.3226, color: [199, 70, 88], alpha: 0.5 } },
  dark: { base: [220, 28, 9], dot: [210, 40, 80], alpha: 0.34, tint: { x: 0.6, y: 0.0968, rx: 0.8667, ry: 0.3226, color: [199, 60, 30], alpha: 0.35 } },
}

// ── גלים: four translucent bands rising from the bottom of the screen, fixed ──
/** [colour, alpha at the crest, top of its gradient (box units)] per band, back to front */
export const WAVES: Record<Mode, { base: Hsl; bands: ReadonlyArray<readonly [Hsl, number, number]>; edge: Hsl; edgeAlpha: number }> = {
  light: {
    base: [210, 25, 97],
    bands: [
      [[199, 60, 80], 0.22, 260],
      [[210, 55, 82], 0.26, 330],
      [[225, 55, 86], 0.32, 400],
      [[245, 50, 90], 0.4, 470],
    ],
    edge: [210, 50, 40],
    edgeAlpha: 0.08,
  },
  dark: {
    base: [220, 28, 9],
    bands: [
      [[205, 45, 28], 0.22, 260],
      [[215, 45, 24], 0.28, 330],
      [[228, 40, 22], 0.34, 400],
      [[240, 35, 20], 0.4, 470],
    ],
    edge: [200, 60, 70],
    edgeAlpha: 0.1,
  },
}
/** A band's alpha at the bottom of the box, as a share of its alpha at the crest */
export const WAVE_FOOT = 0.6
/** A band's fill: its crest, then down past the box's bottom corners */
export function waveBandPath(i: number): string {
  const { width: W, height: H } = WAVES_BOX
  return `${WAVE_CRESTS[i]}L${W + 60} ${H + 10}L-60 ${H + 10}Z`
}

export function wavesSvg(mode: Mode): string {
  const { width: W, height: H } = WAVES_BOX
  const w = WAVES[mode]
  const grads = w.bands
    .map(([c, a, top], i) => `<linearGradient id="w${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${H}"><stop offset="0" stop-color="${hsla(c)}" stop-opacity="${r4(a)}"/><stop offset="1" stop-color="${hsla(c)}" stop-opacity="${r4(a * WAVE_FOOT)}"/></linearGradient>`)
    .join('')
  const fills = w.bands.map((_, i) => `<path d="${waveBandPath(i)}" fill="url(#w${i})"/>`).join('')
  const edges = WAVE_CRESTS.map(d => `<path d="${d}"/>`).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<defs>${grads}</defs>${fills}` +
    `<g fill="none" stroke="${hsla(w.edge)}" stroke-opacity="${r4(w.edgeAlpha)}" stroke-width="1" vector-effect="non-scaling-stroke">${edges}</g></svg>`
  )
}

// ── טופוגרפי: contour lines, a tile ────────────────────────────────────
export const TOPO: Record<Mode, { base: Hsl; line: Hsl; minor: number; major: number }> = {
  light: { base: [40, 20, 97.5], line: [214, 40, 30], minor: 0.13, major: 0.22 },
  dark: { base: [220, 28, 9], line: [200, 45, 75], minor: 0.15, major: 0.27 },
}
export const TOPO_WIDTH = { minor: 0.8, major: 1.1 } as const

export function topoTileSvg(mode: Mode): string {
  const t = TOPO[mode]
  const { width: W, height: H } = TOPO_TILE
  const group = (major: boolean) =>
    `<g stroke-opacity="${r4(major ? t.major : t.minor)}" stroke-width="${major ? TOPO_WIDTH.major : TOPO_WIDTH.minor}">` +
    TOPO_PATHS.filter(p => p.major === major).map(p => `<path d="${p.d}"/>`).join('') +
    '</g>'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<g fill="none" stroke="${hsla(t.line)}" stroke-linecap="round" stroke-linejoin="round">${group(false)}${group(true)}</g></svg>`
  )
}

// ── רשת: a blueprint grid, a tile, with a pale wash at the top of the page ──
export const GRID_TILE = { size: 75, step: 15 } as const
/** The wash: a glow at the top of the document (px; x as a fraction of the page width) */
export const GRID_WASH = { x: 0.8, rx: 390, ry: 340 } as const
export const GRID: Record<Mode, { base: Hsl; line: Hsl; minor: number; major: number; wash: Hsl; washAlpha: number }> = {
  light: { base: [210, 35, 98], line: [205, 60, 40], minor: 0.055, major: 0.1, wash: [205, 70, 90], washAlpha: 0.55 },
  dark: { base: [218, 35, 9], line: [199, 70, 65], minor: 0.035, major: 0.08, wash: [205, 60, 25], washAlpha: 0.35 },
}

export function gridTileSvg(mode: Mode): string {
  const g = GRID[mode]
  const { size, step } = GRID_TILE
  let minor = ''
  for (let p = step; p < size; p += step) minor += `M${p + 0.5} 0V${size}M0 ${p + 0.5}H${size}`
  const major = `M0.5 0V${size}M0 0.5H${size}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<g fill="none" stroke="${hsla(g.line)}" stroke-width="1"><path d="${minor}" stroke-opacity="${r4(g.minor)}"/><path d="${major}" stroke-opacity="${r4(g.major)}"/></g></svg>`
  )
}

export function gridWashCss(mode: Mode): string {
  const g = GRID[mode]
  const stops = GLOW_STOPS.map(([at, share]) => `${hsla(g.wash, g.washAlpha * share)} ${pct(at)}`).join(', ')
  return `radial-gradient(${GRID_WASH.rx}px ${GRID_WASH.ry}px at ${pct(GRID_WASH.x)} 0, ${stops})`
}

// ── בועות: large soft circles, a tile ─────────────────────────────────
export const BUBBLES_TILE = { width: 600, height: 840 } as const
/** x, y, radius, colour (0-2) in the tile */
export const BUBBLES: ReadonlyArray<readonly [number, number, number, 0 | 1 | 2]> = [
  [325, 91, 124, 0],
  [52, 260, 91, 1],
  [273, 429, 156, 2],
  [78, 611, 117, 0],
  [351, 728, 98, 1],
  [169, 793, 72, 2],
  [156, 52, 49, 2],
  [520, 230, 96, 1],
  [505, 560, 74, 0],
]
/** [offset, share of the fill alpha]: a little clearer inside, fullest near the rim, soft at the very edge */
export const BUBBLE_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.55],
  [0.78, 1],
  [0.93, 0.85],
  [1, 0],
]
export const BUBBLE_COLORS: Record<Mode, { base: Hsl; colors: readonly [Hsl, Hsl, Hsl]; alpha: number }> = {
  light: { base: [210, 25, 97], colors: [[199, 70, 80], [256, 70, 87], [165, 50, 82]], alpha: 0.42 },
  dark: { base: [220, 28, 9], colors: [[199, 65, 50], [256, 55, 62], [170, 50, 45]], alpha: 0.16 },
}

/** Offsets at which a circle is also drawn so the tile is seamless (it reaches over an edge). */
export function bubbleCopies(x: number, y: number, r: number): Array<readonly [number, number]> {
  const { width: W, height: H } = BUBBLES_TILE
  const out: Array<readonly [number, number]> = []
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      if (x + dx + r < 0 || x + dx - r > W || y + dy + r < 0 || y + dy - r > H) continue
      out.push([dx, dy])
    }
  }
  return out
}

export function bubblesTileSvg(mode: Mode): string {
  const b = BUBBLE_COLORS[mode]
  const { width: W, height: H } = BUBBLES_TILE
  const grads = b.colors
    .map((c, i) => `<radialGradient id="b${i}">${BUBBLE_STOPS.map(([at, share]) => `<stop offset="${at}" stop-color="${hsla(c)}" stop-opacity="${r4(b.alpha * share)}"/>`).join('')}</radialGradient>`)
    .join('')
  const circles = BUBBLES.flatMap(([x, y, r, ci]) => bubbleCopies(x, y, r).map(([dx, dy]) => `<circle cx="${x + dx}" cy="${y + dy}" r="${r}" fill="url(#b${ci})"/>`)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${grads}</defs>${circles}</svg>`
}

// ── What the page shows ────────────────────────────────────────────────

/** The page colour under a wallpaper. */
export function wallpaperBase(kind: WallpaperKind, mode: Mode): Hsl {
  switch (kind) {
    case 'aurora':
      return AURORA[mode].base
    case 'sunrise':
      return SUNRISE[mode].base
    case 'dots':
      return DOTS[mode].base
    case 'waves':
      return WAVES[mode].base
    case 'topo':
      return TOPO[mode].base
    case 'grid':
      return GRID[mode].base
    case 'bubbles':
      return BUBBLE_COLORS[mode].base
  }
}

export function isFixedWallpaper(kind: WallpaperKind): boolean {
  return kind === 'aurora' || kind === 'waves' || kind === 'dots' || kind === 'sunrise'
}

/** The SVG a wallpaper needs (its tile, or the waves), or null when it is CSS only. */
export function wallpaperSvg(kind: WallpaperKind, mode: Mode): string | null {
  if (kind === 'topo') return topoTileSvg(mode)
  if (kind === 'grid') return gridTileSvg(mode)
  if (kind === 'bubbles') return bubblesTileSvg(mode)
  if (kind === 'waves') return wavesSvg(mode)
  return null
}

export interface WallpaperLayers {
  /** background-image (top layer first) */
  image: string
  /** background-size, one per layer */
  size: string
  /** background-repeat, one per layer */
  repeat: string
}

/**
 * The background layers of a wallpaper. `svg` is the URL of its SVG (the
 * tile route, or a data URI), for the kinds that have one.
 */
export function wallpaperLayers(kind: WallpaperKind, mode: Mode, svg: string | null): WallpaperLayers {
  const url = svg ? `url("${svg}")` : 'none'
  switch (kind) {
    case 'aurora':
    case 'sunrise': {
      const glows = (kind === 'aurora' ? AURORA : SUNRISE)[mode].glows
      return { image: [...glows].reverse().map(glowCss).join(', '), size: glows.map(() => 'auto').join(', '), repeat: glows.map(() => 'no-repeat').join(', ') }
    }
    case 'dots': {
      const d = DOTS[mode]
      const base = wallpaperBase(kind, mode)
      const fade = `radial-gradient(${pct(DOT_FADE.rx)} ${pct(DOT_FADE.ry)} at ${pct(DOT_FADE.x)} ${pct(DOT_FADE.y)}, ${DOT_FADE.stops.map(([at, a]) => `${hsla(base, a)} ${pct(at)}`).join(', ')})`
      const dot = `radial-gradient(circle at ${DOT_GRID.ox}px ${DOT_GRID.oy}px, ${hsla(d.dot, d.alpha)} ${DOT_GRID.r}px, ${hsla(d.dot, 0)} ${DOT_GRID.soft}px)`
      return { image: `${glowCss(d.tint)}, ${fade}, ${dot}`, size: `auto, auto, ${DOT_GRID.gap}px ${DOT_GRID.gap}px`, repeat: 'no-repeat, no-repeat, repeat' }
    }
    case 'waves':
      return { image: url, size: '100% 100%', repeat: 'no-repeat' }
    case 'grid':
      return { image: `${url}, ${gridWashCss(mode)}`, size: `auto, 100% ${GRID_WASH.ry}px`, repeat: 'repeat, no-repeat' }
    case 'topo':
    case 'bubbles':
      return { image: url, size: 'auto', repeat: 'repeat' }
  }
}

/**
 * The layers of a wallpaper's thumbnail in Settings → רקע: the same layers,
 * the tiles and the dot grid drawn smaller so a few of their repeats fit
 * (the glows are fractions of their box, so they fit on their own).
 */
export function wallpaperThumbLayers(kind: WallpaperKind, mode: Mode, svg: string | null): WallpaperLayers {
  const url = svg ? `url("${svg}")` : 'none'
  const scaled = (w: number, h: number, k: number) => `${r4(w * k)}px ${r4(h * k)}px`
  switch (kind) {
    case 'dots': {
      const d = DOTS[mode]
      const base = wallpaperBase(kind, mode)
      const k = 0.5
      const fade = `radial-gradient(${pct(DOT_FADE.rx)} ${pct(DOT_FADE.ry)} at ${pct(DOT_FADE.x)} ${pct(DOT_FADE.y)}, ${DOT_FADE.stops.map(([at, a]) => `${hsla(base, a)} ${pct(at)}`).join(', ')})`
      const dot = `radial-gradient(circle at ${DOT_GRID.ox * k}px ${DOT_GRID.oy * k}px, ${hsla(d.dot, d.alpha)} ${DOT_GRID.r * 0.6}px, ${hsla(d.dot, 0)} ${DOT_GRID.soft * 0.6}px)`
      return { image: `${glowCss(d.tint)}, ${fade}, ${dot}`, size: `auto, auto, ${scaled(DOT_GRID.gap, DOT_GRID.gap, k)}`, repeat: 'no-repeat, no-repeat, repeat' }
    }
    case 'topo':
      return { image: url, size: scaled(TOPO_TILE.width, TOPO_TILE.height, 0.45), repeat: 'repeat' }
    case 'bubbles':
      return { image: url, size: scaled(BUBBLES_TILE.width, BUBBLES_TILE.height, 0.3), repeat: 'repeat' }
    case 'grid':
      return { image: `${url}, ${gridWashCss(mode)}`, size: `${scaled(GRID_TILE.size, GRID_TILE.size, 0.5)}, 100% 100%`, repeat: 'repeat, no-repeat' }
    default:
      return wallpaperLayers(kind, mode, svg)
  }
}
