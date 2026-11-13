/*
 * Generates the path data of two wallpapers (lib/background/wallpapers.ts):
 * the contour lines of טופוגרפי and the wave crests of גלים. Runs once, in
 * scripts/gen-wallpaper-data.mjs; the result is committed in
 * wallpapers.data.ts so the server and every browser draw exactly the same
 * paths (as lines-tile.data.ts does for the lines).
 */

export const TOPO_TILE = { width: 640, height: 960 } as const
/** The grid the field is sampled on, in px */
const TOPO_STEP = 4
/** Contour levels: from, step, to */
const TOPO_LEVELS = { from: 0.08, step: 0.075, to: 1.2 } as const
/** Every this-many-th level is a major (slightly stronger) line */
export const TOPO_MAJOR_EVERY = 4

type Pt = readonly [number, number]

const f1 = (n: number) => Number(n.toFixed(1)).toString()

/** Catmull-Rom through the points as cubic Béziers (closed: back to the first point). */
export function catmullRom(pts: ReadonlyArray<Pt>, closed: boolean): string {
  const n = pts.length
  if (n < 2) return ''
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`
  }
  return closed ? `${d}Z` : d
}

/**
 * The terrain: soft hills on a torus (distances wrap round the tile) plus a
 * gentle ripple whose periods divide the tile, so the field, and every
 * contour of it, repeats seamlessly.
 */
export function topoField(x: number, y: number): number {
  const { width: W, height: H } = TOPO_TILE
  const hills: ReadonlyArray<readonly [number, number, number, number]> = [
    // x, y, spread, height
    [500, 190, 120, 1.0],
    [110, 560, 150, 0.9],
    [470, 760, 90, 0.55],
    [200, 120, 80, 0.45],
    [330, 420, 190, 0.3],
    [600, 520, 70, 0.4],
  ]
  let v = 0
  for (const [hx, hy, s, h] of hills) {
    let dx = Math.abs(x - hx) % W
    let dy = Math.abs(y - hy) % H
    dx = Math.min(dx, W - dx)
    dy = Math.min(dy, H - dy)
    v += h * Math.exp(-(dx * dx + dy * dy) / (2 * s * s))
  }
  const tx = (2 * Math.PI * x) / W
  const ty = (2 * Math.PI * y) / H
  return v + 0.06 * Math.sin(tx + 2 * ty) + 0.05 * Math.cos(2 * tx - ty + 1)
}

export interface TopoPath {
  d: string
  major: boolean
}

/**
 * The contour lines of the tile (marching squares on the field). The grid
 * covers the tile exactly and its last row and column are the first again,
 * so a line leaving one edge comes back at the very same point on the other.
 */
export function generateTopoTile(): TopoPath[] {
  const { width: W, height: H } = TOPO_TILE
  const nx = W / TOPO_STEP
  const ny = H / TOPO_STEP
  const v: number[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v.push(topoField(i * TOPO_STEP, j * TOPO_STEP))
  const at = (i: number, j: number) => v[(j % ny) * nx + (i % nx)]
  const out: TopoPath[] = []
  let level = 0
  for (let L = TOPO_LEVELS.from; L < TOPO_LEVELS.to; L += TOPO_LEVELS.step, level++) {
    type End = readonly [string, Pt]
    const segs: Array<readonly [End, End]> = []
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = at(i, j)
        const b = at(i + 1, j)
        const c = at(i + 1, j + 1)
        const d = at(i, j + 1)
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0)
        if (idx === 0 || idx === 15) continue
        const x = i * TOPO_STEP
        const y = j * TOPO_STEP
        const t = (p: number, q: number) => (L - p) / (q - p)
        const E: Record<'t' | 'r' | 'b' | 'l', End> = {
          t: [`h${i},${j}`, [x + TOPO_STEP * t(a, b), y]],
          r: [`v${i + 1},${j}`, [x + TOPO_STEP, y + TOPO_STEP * t(b, c)]],
          b: [`h${i},${j + 1}`, [x + TOPO_STEP * t(d, c), y + TOPO_STEP]],
          l: [`v${i},${j}`, [x, y + TOPO_STEP * t(a, d)]],
        }
        const table: Record<number, Array<readonly ['t' | 'r' | 'b' | 'l', 't' | 'r' | 'b' | 'l']>> = {
          1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']], 5: [['l', 't'], ['b', 'r']],
          6: [['t', 'b']], 7: [['l', 't']], 8: [['l', 't']], 9: [['t', 'b']], 10: [['l', 'b'], ['t', 'r']],
          11: [['t', 'r']], 12: [['l', 'r']], 13: [['b', 'r']], 14: [['l', 'b']],
        }
        for (const [p, q] of table[idx]) segs.push([E[p], E[q]])
      }
    }
    // Chain the segments into lines
    const byEnd = new Map<string, number[]>()
    segs.forEach((s, k) => {
      for (const e of s) {
        const list = byEnd.get(e[0])
        if (list) list.push(k)
        else byEnd.set(e[0], [k])
      }
    })
    const used = new Uint8Array(segs.length)
    for (let k = 0; k < segs.length; k++) {
      if (used[k]) continue
      used[k] = 1
      const line: End[] = [segs[k][0], segs[k][1]]
      for (const forward of [true, false]) {
        for (;;) {
          const end = forward ? line[line.length - 1] : line[0]
          const next = (byEnd.get(end[0]) ?? []).find(m => !used[m])
          if (next === undefined) break
          used[next] = 1
          const s = segs[next]
          const other = s[0][0] === end[0] ? s[1] : s[0]
          if (forward) line.push(other)
          else line.unshift(other)
        }
      }
      const closed = line.length > 3 && line[0][0] === line[line.length - 1][0]
      const all = line.map(e => e[1])
      // Every third point is plenty for the curve; the ends stay where they are (on the tile edge)
      const pts = all.filter((_, n) => n % 3 === 0 || n === all.length - 1)
      if (pts.length < 3) continue
      out.push({ d: catmullRom(closed ? pts.slice(0, -1) : pts, closed), major: level % TOPO_MAJOR_EVERY === 0 })
    }
  }
  return out
}

/** The waves of גלים, in a 300 × 620 box that is stretched over the screen. */
export const WAVES_BOX = { width: 300, height: 620 } as const

/** One crest per band: the line its top follows, from left to right past both sides. */
export function generateWaveCrests(): string[] {
  const { width: W } = WAVES_BOX
  const specs: ReadonlyArray<readonly [number, number, number, number]> = [
    // baseline y, amplitude, phase, frequency (as on the mockup)
    [300, 26, 0.4, 0.9],
    [370, 22, 2.1, 1.05],
    [440, 20, 4.0, 0.85],
    [510, 16, 5.3, 1.15],
  ]
  return specs.map(([y0, amp, ph, k]) => {
    const pts: Pt[] = []
    for (let i = -1; i <= 7; i++) pts.push([(i / 6) * W, y0 + amp * Math.sin(i * k + ph) + amp * 0.4 * Math.sin(i * k * 2.3 + ph * 1.7)])
    return catmullRom(pts, false)
  })
}
