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

describe('readBackgroundSetting', () => {
  const root = (data: Record<string, string>, strength: string) => ({ dataset: data as DOMStringMap, style: { getPropertyValue: () => strength } })
  it('reads the attributes and strength on <html>', () => {
    expect(readBackgroundSetting(root({ bg: 'ribbons', bgPalette: 'ocean' }, '0.18'))).toEqual({ kind: 'ribbons', palette: 'ocean', strength: 18 })
  })
  it('defaults what is missing or unknown', () => {
    expect(readBackgroundSetting(root({ bg: 'confetti' }, ''))).toEqual({ kind: 'lines', palette: 'indigo-pink', strength: 10 })
  })
})
