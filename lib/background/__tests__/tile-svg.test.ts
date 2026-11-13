import { describe, it, expect } from 'vitest'
import { linesTileSvg, parseTileQuery, ribbonsTileSvg, tileDataUri, tileStyle, tileSvg, tileUrl } from '../tile-svg'
import { readBackgroundSetting } from '../read-setting'
import { TILE_HEIGHT, TILE_WIDTH } from '../lines'
import { LINES_TILE } from '../lines-tile.data'

describe('linesTileSvg', () => {
  const svg = linesTileSvg('indigo-pink', 10, 'light')
  it('is one tile, every line and its seam copies, in the palette colours, at the strength', () => {
    expect(svg).toContain(`width="${TILE_WIDTH}" height="${TILE_HEIGHT}"`)
    expect(svg.match(/<path /g)).toHaveLength(LINES_TILE.reduce((n, p) => n + p.copies.length, 0))
    expect(svg).toContain('#4f46e5')
    expect(svg).toContain('#d946ef')
    expect(svg).toContain('opacity="0.1"')
    expect(svg).toContain('stroke-linecap="round"')
  })
  it('uses the lighter tints on dark pages and clamps the strength', () => {
    const dark = linesTileSvg('ocean', 80, 'dark')
    expect(dark).toContain('#38bdf8')
    expect(dark).toContain('opacity="0.3"')
  })
})

describe('ribbonsTileSvg', () => {
  it('blurs the ribbons inside the tile', () => {
    const svg = ribbonsTileSvg('light')
    expect(svg).toContain('feGaussianBlur')
    expect(svg.match(/<path /g)).toHaveLength(4)
    expect(ribbonsTileSvg('dark')).toContain('#7c3aed')
  })
})

describe('tile URLs and styles', () => {
  const lines = { kind: 'lines' as const, strength: 12, palette: 'grey' as const }
  it('the plain backdrop has no tile', () => {
    const plain = { ...lines, kind: 'plain' as const }
    expect(tileSvg(plain, 'light')).toBeNull()
    expect(tileUrl(plain, 'light')).toBeNull()
    expect(tileStyle(plain, tileUrl)).toEqual({ '--bg-tile-light': 'none', '--bg-tile-dark': 'none' })
  })
  it('the route URL round-trips through parseTileQuery', () => {
    const url = tileUrl(lines, 'dark')!
    const parsed = parseTileQuery(new URL(url, 'http://x').searchParams)
    expect(parsed).toEqual({ setting: lines, mode: 'dark' })
  })
  it('rejects anything that is not a tile', () => {
    expect(parseTileQuery(new URLSearchParams('k=plain&p=grey&s=10&m=light'))).toBeNull()
    expect(parseTileQuery(new URLSearchParams('k=lines&p=neon&s=10&m=light'))).toBeNull()
    expect(parseTileQuery(new URLSearchParams('k=lines&p=grey&s=x&m=light'))).toBeNull()
    expect(parseTileQuery(new URLSearchParams('k=lines&p=grey&s=10&m=sepia'))).toBeNull()
  })
  it('the client inlines the same tile as a data URI', () => {
    const uri = tileDataUri(lines, 'light')!
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toBe(tileSvg(lines, 'light'))
  })
  it('tileStyle gives both themes', () => {
    const s = tileStyle(lines, tileUrl)
    expect(s['--bg-tile-light']).toMatch(/^url\("\/background-tile\?/)
    expect(s['--bg-tile-dark']).toContain('m=dark')
  })
})

describe('wallpapers on the page', () => {
  const s = (kind: 'aurora' | 'waves' | 'topo' | 'dots' | 'sunrise' | 'grid' | 'bubbles') => ({ kind, strength: 10, palette: 'indigo-pink' as const })
  it('the CSS-only wallpapers have no SVG and no route', () => {
    for (const kind of ['aurora', 'dots', 'sunrise'] as const) {
      expect(tileSvg(s(kind), 'light')).toBeNull()
      expect(tileUrl(s(kind), 'dark')).toBeNull()
    }
  })
  it('the tiles and the waves come from the route, and round-trip', () => {
    for (const kind of ['waves', 'topo', 'grid', 'bubbles'] as const) {
      const url = tileUrl(s(kind), 'dark')!
      expect(parseTileQuery(new URL(url, 'http://x').searchParams)).toEqual({ setting: s(kind), mode: 'dark' })
      expect(tileSvg(s(kind), 'dark')).toMatch(/^<svg xmlns/)
    }
    expect(parseTileQuery(new URLSearchParams('k=aurora&p=grey&s=10&m=light'))).toBeNull()
  })
  it('tileStyle gives the layers, sizes and page colours of both themes', () => {
    const dots = tileStyle(s('dots'), tileUrl)
    expect(dots['--bg-tile-light'].match(/radial-gradient/g)).toHaveLength(3)
    expect(dots['--bg-size']).toBe('auto, auto, 16px 16px')
    expect(dots['--bg-repeat']).toBe('no-repeat, no-repeat, repeat')
    expect(dots['--bg-page-light']).toBe('hsl(210, 30%, 98%)')
    expect(dots['--bg-page-dark']).toBe('hsl(220, 28%, 9%)')
    const grid = tileStyle(s('grid'), tileUrl)
    expect(grid['--bg-tile-dark']).toMatch(/^url\("\/background-tile\?k=grid.*m=dark"\), radial-gradient\(390px 340px at 80% 0/)
    expect(grid['--bg-size']).toBe('auto, 100% 340px')
    const waves = tileStyle(s('waves'), tileDataUri)
    expect(waves['--bg-tile-light']).toMatch(/^url\("data:image\/svg\+xml,/)
    expect(waves['--bg-size']).toBe('100% 100%')
  })
  it('the aurora lists its glows top first, as CSS paints them', () => {
    const img = tileStyle(s('aurora'), tileUrl)['--bg-tile-dark']
    expect(img.match(/radial-gradient/g)).toHaveLength(4)
    expect(img.indexOf('6.67%')).toBeLessThan(img.indexOf('23.33%'))
  })
})

describe('readBackgroundSetting', () => {
  const root = (data: Record<string, string>, strength: string) => ({ dataset: data as DOMStringMap, style: { getPropertyValue: () => strength } })
  it('reads the attributes and strength on <html>', () => {
    expect(readBackgroundSetting(root({ bg: 'ribbons', bgPalette: 'ocean' }, '0.18'))).toEqual({ kind: 'ribbons', palette: 'ocean', strength: 18 })
  })
  it('reads a wallpaper', () => {
    expect(readBackgroundSetting(root({ bg: 'sunrise', bgPalette: 'grey' }, '0.1'))).toEqual({ kind: 'sunrise', palette: 'grey', strength: 10 })
  })
  it('defaults what is missing or unknown', () => {
    expect(readBackgroundSetting(root({ bg: 'confetti' }, ''))).toEqual({ kind: 'lines', palette: 'indigo-pink', strength: 10 })
  })
})
