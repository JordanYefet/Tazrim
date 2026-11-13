import { describe, it, expect } from 'vitest'
import {
  AURORA,
  BUBBLES,
  BUBBLES_TILE,
  DOT_FADE,
  SUNRISE,
  WALLPAPER_KINDS,
  bubbleCopies,
  bubblesTileSvg,
  glowCss,
  gridTileSvg,
  hsla,
  hslHex,
  isFixedWallpaper,
  topoTileSvg,
  wallpaperBase,
  wallpaperLayers,
  wavesSvg,
} from '../wallpapers'
import { TOPO_TILE, catmullRom, generateTopoTile, generateWaveCrests, topoField } from '../wallpaper-gen'
import { TOPO_PATHS, WAVE_CRESTS } from '../wallpapers.data'
import { isFixedKind } from '../setting'
import { pageColor } from '../paint'

describe('colours', () => {
  it('hsla writes the comma syntax canvases read', () => {
    expect(hsla([210, 30, 98])).toBe('hsl(210, 30%, 98%)')
    expect(hsla([256, 80, 88], 0.385)).toBe('hsla(256, 80%, 88%, 0.385)')
  })
  it('hslHex converts', () => {
    expect(hslHex([0, 0, 100])).toBe('#ffffff')
    expect(hslHex([0, 100, 50])).toBe('#ff0000')
    expect(hslHex([220, 28, 9])).toBe('#11151d')
  })
  it('every wallpaper has a page colour per theme, which the glass reads', () => {
    for (const kind of WALLPAPER_KINDS) {
      for (const dark of [false, true]) {
        expect(pageColor({ kind, strength: 10, palette: 'grey' }, dark)).toBe(hslHex(wallpaperBase(kind, dark ? 'dark' : 'light')))
      }
    }
    expect(pageColor({ kind: 'plain', strength: 10, palette: 'grey' }, false)).toBeNull()
  })
})

describe('the two mechanisms', () => {
  it('fixed wallpapers are fixed kinds; the tiles are not', () => {
    for (const kind of WALLPAPER_KINDS) expect(isFixedKind(kind)).toBe(isFixedWallpaper(kind))
  })
})

describe('glows', () => {
  it('a glow is a radial gradient sized and placed in fractions of the viewport', () => {
    expect(glowCss({ x: 0.5, y: -0.1, rx: 0.8, ry: 0.25, color: [200, 50, 50], alpha: 0.5 })).toBe(
      'radial-gradient(80% 25% at 50% -10%, hsla(200, 50%, 50%, 0.5) 0%, hsla(200, 50%, 50%, 0.275) 45%, hsla(200, 50%, 50%, 0) 100%)'
    )
  })
  it('dark aurora and sunrise keep the glow behind the top of the page low (muted labels stay readable)', () => {
    const top = (gs: ReadonlyArray<{ y: number; alpha: number }>) => Math.max(...gs.filter(g => g.y < 0.2).map(g => g.alpha))
    expect(top(AURORA.dark.glows)).toBeLessThanOrEqual(0.45)
    expect(top(SUNRISE.dark.glows)).toBeLessThanOrEqual(0.5)
  })
  it('the dot fade runs from clear to the page colour', () => {
    expect(DOT_FADE.stops[0]).toEqual([0, 0])
    expect(DOT_FADE.stops[DOT_FADE.stops.length - 1]).toEqual([1, 1])
  })
})

describe('the topographic tile', () => {
  it('the data file is what the generator makes', () => {
    expect(generateTopoTile()).toEqual(TOPO_PATHS)
    expect(generateWaveCrests()).toEqual(WAVE_CRESTS)
  })
  it('the field repeats across the tile', () => {
    for (const [x, y] of [[0, 0], [123, 456], [600, 20]]) {
      expect(topoField(x + TOPO_TILE.width, y)).toBeCloseTo(topoField(x, y), 9)
      expect(topoField(x, y + TOPO_TILE.height)).toBeCloseTo(topoField(x, y), 9)
    }
  })
  it('lines stay inside the tile, and every end on an edge is met by an end on the opposite edge', () => {
    const ends: Array<[number, number]> = []
    for (const p of TOPO_PATHS) {
      const nums = p.d.replace(/[MCZ]/g, ' ').trim().split(/\s+/).map(Number)
      for (let i = 0; i < nums.length; i += 2) {
        expect(nums[i]).toBeGreaterThanOrEqual(-12)
        expect(nums[i]).toBeLessThanOrEqual(TOPO_TILE.width + 12)
      }
      if (p.d.endsWith('Z')) continue
      ends.push([nums[0], nums[1]], [nums[nums.length - 2], nums[nums.length - 1]])
    }
    const { width: W, height: H } = TOPO_TILE
    const near = (a: number, b: number) => Math.abs(a - b) < 0.11
    for (const [x, y] of ends) {
      const onEdge = near(x, 0) || near(x, W) || near(y, 0) || near(y, H)
      expect(onEdge).toBe(true)
      const partner = near(x, 0) ? [W, y] : near(x, W) ? [0, y] : near(y, 0) ? [x, H] : [x, 0]
      expect(ends.some(([px, py]) => near(px, partner[0]) && near(py, partner[1]))).toBe(true)
    }
  })
  it('catmullRom passes through its points and closes when asked', () => {
    expect(catmullRom([[0, 0], [10, 0], [20, 5]], false)).toMatch(/^M0 0C.* 20 5$/)
    expect(catmullRom([[0, 0], [10, 0], [5, 8]], true).endsWith('Z')).toBe(true)
  })
})

describe('tile SVGs', () => {
  it('topo: minor and major lines, in both themes', () => {
    expect(topoTileSvg('light').match(/<path /g)).toHaveLength(TOPO_PATHS.length)
    expect(topoTileSvg('dark')).toContain('stroke-opacity="0.27"')
  })
  it('grid: one tile of four minor lines each way and the major line on its edge', () => {
    const svg = gridTileSvg('light')
    expect(svg).toContain('width="75" height="75"')
    expect(svg).toContain('M15.5 0V75M0 15.5H75')
    expect(svg).toContain('M0.5 0V75M0 0.5H75')
  })
  it('bubbles: a circle over an edge is drawn again on the other side', () => {
    expect(bubbleCopies(300, 400, 50)).toEqual([[0, 0]])
    expect(bubbleCopies(20, 400, 50)).toEqual([[0, 0], [BUBBLES_TILE.width, 0]])
    const total = BUBBLES.reduce((n, [x, y, r]) => n + bubbleCopies(x, y, r).length, 0)
    expect(bubblesTileSvg('dark').match(/<circle /g)).toHaveLength(total)
  })
  it('waves: stretched over the screen, hairlines that do not stretch', () => {
    const svg = wavesSvg('light')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('vector-effect="non-scaling-stroke"')
    expect(svg.match(/<path /g)).toHaveLength(8)
  })
  it('layers need the SVG only where there is one', () => {
    expect(wallpaperLayers('topo', 'light', null).image).toBe('none')
    expect(wallpaperLayers('topo', 'light', '/t.svg').image).toBe('url("/t.svg")')
  })
})
