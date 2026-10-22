'use client'

import { useEffect, useState } from 'react'
import { LINES_TILE } from '@/lib/background/lines-tile.data'
import { LINE_WIDTH, TILE_HEIGHT, TILE_WIDTH } from '@/lib/background/lines'
import { RIBBONS, RIBBON_BOX, RIBBON_GRADIENTS } from '@/lib/background/ribbons'
import type { BackgroundKind } from '@/lib/background/setting'
import { TILE_ID } from '@/components/glass/glass-runtime'

/*
 * The page background (ENG-72), behind every page: a layer fixed to the
 * viewport above the tonal backdrop (body::before). Static: no motion.
 *
 *   lines    the seamless tile (lib/background/lines.ts) repeated from the
 *            viewport's top-left corner; colours and strength come from the
 *            stylesheet (--bg-line-a / -b, --bg-strength on <html>)
 *   ribbons  four soft ribbons, blurred, stretched to the viewport
 *
 * The tile itself lives in a 0 × 0 SVG that is always rendered, so the glass
 * lens (components/glass) can <use> it whatever the setting.
 */

const SERVER_GRID = { cols: 3, rows: 2 }

function useTileGrid() {
  const [grid, setGrid] = useState(SERVER_GRID)
  useEffect(() => {
    const fit = () => {
      const cols = Math.max(1, Math.ceil(window.innerWidth / TILE_WIDTH))
      const rows = Math.max(1, Math.ceil(window.innerHeight / TILE_HEIGHT))
      setGrid(g => (g.cols === cols && g.rows === rows ? g : { cols, rows }))
    }
    fit()
    window.addEventListener('resize', fit, { passive: true })
    return () => window.removeEventListener('resize', fit)
  }, [])
  return grid
}

function TileDefs() {
  return (
    <svg aria-hidden className="bg-defs" width="0" height="0" focusable="false">
      <defs>
        <clipPath id="tz-bg-clip" clipPathUnits="userSpaceOnUse">
          <rect width={TILE_WIDTH} height={TILE_HEIGHT} />
        </clipPath>
        <g id={TILE_ID} clipPath="url(#tz-bg-clip)" fill="none" strokeWidth={LINE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
          {LINES_TILE.flatMap((p, i) =>
            p.copies.map(([dx, dy]) => (
              <path
                key={`${i}:${dx}:${dy}`}
                d={p.d}
                transform={dx || dy ? `translate(${dx} ${dy})` : undefined}
                style={{ stroke: p.color ? 'var(--bg-line-b)' : 'var(--bg-line-a)' }}
              />
            ))
          )}
        </g>
      </defs>
    </svg>
  )
}

function Lines() {
  const { cols, rows } = useTileGrid()
  const uses = []
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) uses.push(<use key={`${i}-${j}`} href={`#${TILE_ID}`} x={i * TILE_WIDTH} y={j * TILE_HEIGHT} />)
  }
  return (
    <svg aria-hidden className="bg-layer bg-layer--lines" focusable="false">
      <g className="bg-layer__lines">{uses}</g>
    </svg>
  )
}

function Ribbons() {
  return (
    <svg aria-hidden className="bg-layer bg-layer--ribbons" viewBox={`0 0 ${RIBBON_BOX.width} ${RIBBON_BOX.height}`} preserveAspectRatio="none" focusable="false">
      <defs>
        {(['light', 'dark'] as const).flatMap(mode =>
          RIBBON_GRADIENTS[mode].map(([a, b], i) => (
            <linearGradient key={`${mode}${i}`} id={`tz-rb-${mode}-${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          ))
        )}
      </defs>
      {(['light', 'dark'] as const).map(mode => (
        <g key={mode} className={`bg-ribbons bg-ribbons--${mode}`}>
          {RIBBONS.map(([d, gi, opLight, opDark], i) => (
            <path key={i} d={d} fill={`url(#tz-rb-${mode}-${gi})`} opacity={mode === 'light' ? opLight : opDark} />
          ))}
        </g>
      ))}
    </svg>
  )
}

export function BackgroundLayer({ kind }: { kind: BackgroundKind }) {
  return (
    <>
      <TileDefs />
      {kind === 'lines' && <Lines />}
      {kind === 'ribbons' && <Ribbons />}
    </>
  )
}
