import { describe, it, expect } from 'vitest'
import {
  LINE_WIDTH,
  TILE_HEIGHT,
  TILE_WIDTH,
  generateLinesTile,
  seededRandom,
  smoothPath,
  tileCopies,
  torusDistance,
  wrapDelta,
} from '../lines'
import { LINES_TILE } from '../lines-tile.data'

describe('torus helpers', () => {
  it('wrapDelta takes the short way round', () => {
    expect(wrapDelta(10, 100)).toBe(10)
    expect(wrapDelta(90, 100)).toBe(-10)
    expect(wrapDelta(-90, 100)).toBe(10)
  })
  it('torusDistance sees across the tile edge', () => {
    expect(torusDistance({ x: 5, y: 5 }, { x: TILE_WIDTH - 5, y: 5 })).toBeCloseTo(10)
    expect(torusDistance({ x: 5, y: 2 }, { x: 5, y: TILE_HEIGHT - 2 })).toBeCloseTo(4)
  })
  it('seededRandom repeats for a seed and stays in [0, 1)', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    const xs = Array.from({ length: 50 }, () => a())
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs)
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
  })
})

describe('tileCopies', () => {
  it('a path inside the tile is drawn once', () => {
    expect(tileCopies({ minX: 100, minY: 100, maxX: 300, maxY: 300 })).toEqual([[0, 0]])
  })
  it('a path over the right edge is drawn again on the left', () => {
    const c = tileCopies({ minX: TILE_WIDTH - 50, minY: 100, maxX: TILE_WIDTH + 60, maxY: 300 })
    expect(c).toContainEqual([0, 0])
    expect(c).toContainEqual([-TILE_WIDTH, 0])
    expect(c).toHaveLength(2)
  })
  it('a path over a corner gets four copies', () => {
    expect(tileCopies({ minX: -40, minY: -40, maxX: 40, maxY: 40 })).toHaveLength(4)
  })
  it('a path that drifted a whole tile away is brought back', () => {
    expect(tileCopies({ minX: TILE_WIDTH + 200, minY: 100, maxX: TILE_WIDTH + 400, maxY: 300 })).toEqual([[-TILE_WIDTH, 0]])
  })
})

describe('smoothPath', () => {
  it('starts with M and has one cubic per segment', () => {
    const d = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }])
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(2)
    expect(d.endsWith('20 10')).toBe(true)
  })
  it('is empty for fewer than two points', () => {
    expect(smoothPath([{ x: 1, y: 1 }])).toBe('')
  })
})

describe('generateLinesTile', () => {
  const { paths, lines } = generateLinesTile()

  it('the committed tile is what the generator makes (run scripts/gen-background-tile.mjs after changing it)', () => {
    expect(LINES_TILE).toEqual(paths)
  })

  it('lays down a calm handful of long lines', () => {
    expect(lines.length).toBeGreaterThanOrEqual(10)
    expect(lines.length).toBeLessThanOrEqual(40)
    for (const l of lines) expect((l.length - 1) * 4).toBeGreaterThanOrEqual(320)
  })

  it('keeps different lines apart (wider than a stroke)', () => {
    let closest = Infinity
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        for (let a = 0; a < lines[i].length; a += 3) {
          for (let b = 0; b < lines[j].length; b += 3) {
            closest = Math.min(closest, torusDistance(lines[i][a], lines[j][b]))
          }
        }
      }
    }
    expect(closest).toBeGreaterThan(LINE_WIDTH * 2)
  })

  it('covers the tile evenly: no large empty patch', () => {
    // Every point on a coarse grid is within 220px of some line
    for (let x = 0; x < TILE_WIDTH; x += 60) {
      for (let y = 0; y < TILE_HEIGHT; y += 60) {
        let near = Infinity
        for (const l of lines) for (let k = 0; k < l.length; k += 4) near = Math.min(near, torusDistance({ x, y }, l[k]))
        expect(near).toBeLessThan(220)
      }
    }
  })

  it('uses both colours about equally', () => {
    const a = paths.filter(p => p.color === 0).length
    expect(Math.abs(a - (paths.length - a))).toBeLessThanOrEqual(Math.ceil(paths.length / 3))
  })

  // Generates two tiles (each well under a second here, a few on a slow CI machine)
  it('is the same for the same seed and different for another', { timeout: 20_000 }, () => {
    const three = generateLinesTile({ seed: 3 }).paths
    expect(generateLinesTile({ seed: 3 }).paths).toEqual(three)
    expect(three).not.toEqual(paths)
  })
})
