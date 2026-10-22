/*
 * The page background as an SVG tile (ENG-72, round 3): a CSS
 * background-image on <body> that repeats down the document and scrolls with
 * it, so the browser rasterises it once and glass elements can bake what is
 * behind them (components/glass). Pure: used by the tile route
 * (app/background-tile/route.ts) for the first paint and by the client as a
 * data URI when the setting changes.
 */

import { LINES_TILE } from './lines-tile.data'
import { LINE_WIDTH, TILE_HEIGHT, TILE_WIDTH } from './lines'
import { RIBBONS, RIBBON_BAND, RIBBON_BLUR, RIBBON_BOX, RIBBON_GRADIENTS } from './ribbons'
import { clampStrength, paletteColors, type BackgroundKind, type BackgroundPalette, type BackgroundSetting } from './setting'

export type TileMode = 'light' | 'dark'

/** How far the ribbons reach past the tile's sides, so the blur does not fade at the page edge */
const RIBBON_SIDE_BLEED = 30

export function linesTileSvg(palette: BackgroundPalette, strength: number, mode: TileMode): string {
  const [a, b] = paletteColors(palette, mode === 'dark')
  const opacity = clampStrength(strength) / 100
  const paths = LINES_TILE.flatMap(p =>
    p.copies.map(([dx, dy]) => {
      const t = dx || dy ? ` transform="translate(${dx} ${dy})"` : ''
      return `<path d="${p.d}" stroke="${p.color ? b : a}"${t}/>`
    })
  ).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_WIDTH}" height="${TILE_HEIGHT}" viewBox="0 0 ${TILE_WIDTH} ${TILE_HEIGHT}">` +
    `<g fill="none" stroke-width="${LINE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${paths}</g></svg>`
  )
}

/** The transform that places the mockup's ribbons in the tile's band, a little wider than the tile. */
export function ribbonTransform(): string {
  const sx = (RIBBON_BOX.width + 2 * RIBBON_SIDE_BLEED) / RIBBON_BOX.width
  return `translate(${-RIBBON_SIDE_BLEED} ${RIBBON_BAND.y}) scale(${sx.toFixed(4)} ${RIBBON_BAND.scaleY})`
}

export function ribbonsTileSvg(mode: TileMode): string {
  const stops = RIBBON_GRADIENTS[mode]
  const grads = stops
    .map(([c0, c1], i) => `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>`)
    .join('')
  const paths = RIBBONS.map(([d, gi, opLight, opDark]) => `<path d="${d}" fill="url(#g${gi})" opacity="${mode === 'dark' ? opDark : opLight}"/>`).join('')
  const { width, height } = RIBBON_BOX
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>${grads}<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${RIBBON_BLUR[mode]}"/></filter></defs>` +
    `<g filter="url(#b)"><g transform="${ribbonTransform()}">${paths}</g></g></svg>`
  )
}

/** The tile for a setting, or null for the plain backdrop. */
export function tileSvg(setting: BackgroundSetting, mode: TileMode): string | null {
  if (setting.kind === 'lines') return linesTileSvg(setting.palette, setting.strength, mode)
  if (setting.kind === 'ribbons') return ribbonsTileSvg(mode)
  return null
}

/** The tile route's URL (cacheable; used for the server's first paint). */
export function tileUrl(setting: BackgroundSetting, mode: TileMode): string | null {
  if (setting.kind === 'plain') return null
  const q = new URLSearchParams({ k: setting.kind, p: setting.palette, s: String(clampStrength(setting.strength)), m: mode })
  return `/background-tile?${q.toString()}`
}

/** The tile inline (the client, right after a change: no request). */
export function tileDataUri(setting: BackgroundSetting, mode: TileMode): string | null {
  const svg = tileSvg(setting, mode)
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null
}

/** CSS custom properties on <html> that the stylesheet paints the body with. */
export function tileStyle(setting: BackgroundSetting, src: (s: BackgroundSetting, m: TileMode) => string | null): Record<string, string> {
  const light = src(setting, 'light')
  const dark = src(setting, 'dark')
  return { '--bg-tile-light': light ? `url("${light}")` : 'none', '--bg-tile-dark': dark ? `url("${dark}")` : 'none' }
}

/** Reads the tile route's query back into a setting (null when it is not one). */
export function parseTileQuery(q: URLSearchParams): { setting: BackgroundSetting; mode: TileMode } | null {
  const k = q.get('k') as BackgroundKind | null
  const p = q.get('p') as BackgroundPalette | null
  const s = Number(q.get('s'))
  const m = q.get('m')
  if (k !== 'lines' && k !== 'ribbons') return null
  if (m !== 'light' && m !== 'dark') return null
  if (p !== 'indigo-pink' && p !== 'ocean' && p !== 'grey') return null
  if (!Number.isFinite(s)) return null
  return { setting: { kind: k, palette: p, strength: clampStrength(s) }, mode: m }
}
