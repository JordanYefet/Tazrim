'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils/cn'
import {
  BACKGROUND_KINDS,
  BACKGROUND_PALETTES,
  STRENGTH_MAX,
  STRENGTH_MIN,
  type BackgroundKind,
  type BackgroundPalette,
} from '@/lib/background/setting'
import { useBackground } from '@/components/background/background-provider'

/*
 * Settings → רקע (ENG-72, the Settings mockup): the page background, applied
 * as it is picked. Three thumbnails (רגיל / קווים עדינים / סרטי צבע); for the
 * lines, their strength and colours.
 */

/** Arrow keys move through a radiogroup (RTL: left is next). */
function arrowStep(e: KeyboardEvent): 1 | -1 | 0 {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') return 1
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') return -1
  return 0
}

function Thumb({ kind, colors }: { kind: BackgroundKind; colors: readonly [string, string] }) {
  return (
    <span className={cn('pattern-thumb', `pattern-thumb--${kind}`)} aria-hidden>
      {kind === 'lines' && (
        <svg width="100%" height="64" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice" fill="none" strokeLinecap="round" strokeWidth="5">
          <path d="M-5 20 C 10 0, 30 0, 38 22 S 60 60, 78 44 S 80 10, 70 4" stroke={colors[0]} opacity="0.28" />
          <path d="M8 70 C 0 50, 30 40, 50 52 S 90 70, 105 40" stroke={colors[1]} opacity="0.28" />
        </svg>
      )}
      {kind === 'ribbons' && (
        <svg width="100%" height="64" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice" className="pattern-thumb__ribbons">
          <path d="M0 22 C 30 8, 55 40, 100 18 L100 40 C 60 58, 35 30, 0 48 Z" className="pattern-thumb__ribbon-a" />
          <path d="M0 44 C 35 30, 60 60, 100 42 L100 64 L0 64 Z" className="pattern-thumb__ribbon-b" />
        </svg>
      )}
    </span>
  )
}

export function BackgroundSettings() {
  const { setting, update } = useBackground()
  const kindRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const paletteRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const palette = BACKGROUND_PALETTES.find(p => p.value === setting.palette) ?? BACKGROUND_PALETTES[0]

  function onKindKey(e: KeyboardEvent) {
    const dir = arrowStep(e)
    if (!dir) return
    e.preventDefault()
    const i = BACKGROUND_KINDS.findIndex(k => k.value === setting.kind)
    const next = BACKGROUND_KINDS[(i + dir + BACKGROUND_KINDS.length) % BACKGROUND_KINDS.length].value
    update({ kind: next })
    kindRefs.current[next]?.focus()
  }

  function onPaletteKey(e: KeyboardEvent) {
    const dir = arrowStep(e)
    if (!dir) return
    e.preventDefault()
    const i = BACKGROUND_PALETTES.findIndex(p => p.value === setting.palette)
    const next = BACKGROUND_PALETTES[(i + dir + BACKGROUND_PALETTES.length) % BACKGROUND_PALETTES.length].value
    update({ palette: next as BackgroundPalette })
    paletteRefs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-4 rounded-[20px] surface px-4 py-[18px] md:p-6">
      <div className="flex flex-col gap-0.5">
        <h3 id="background-title" className="text-[17px] font-bold">רקע</h3>
        <p className="text-[13px] text-muted-foreground">דוגמה עדינה מאחורי כל הדפים. חשבונות עם צבע &quot;זכוכית&quot; נראים דרכה.</p>
      </div>

      <div role="radiogroup" aria-label="סוג רקע" onKeyDown={onKindKey} className="grid grid-cols-3 gap-2.5">
        {BACKGROUND_KINDS.map(k => {
          const selected = setting.kind === k.value
          return (
            <button
              key={k.value}
              ref={el => {
                kindRefs.current[k.value] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ kind: k.value })}
              className="pattern-choice flex flex-col gap-1.5 rounded-[14px] p-1.5"
            >
              <Thumb kind={k.value} colors={palette.light} />
              <span className="text-center text-[13px] font-semibold">{k.label}</span>
            </button>
          )
        })}
      </div>

      {setting.kind === 'lines' && (
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            <span className="flex justify-between">
              <span>עוצמה</span>
              <span className="font-medium text-muted-foreground tabular-nums" dir="ltr">
                {setting.strength}%
              </span>
            </span>
            <input
              type="range"
              min={STRENGTH_MIN}
              max={STRENGTH_MAX}
              step={1}
              value={setting.strength}
              onChange={e => update({ strength: Number(e.target.value) })}
              className="bg-strength w-full"
              style={{ accentColor: palette.light[0] }}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span id="background-colors" className="text-sm font-semibold">צבעים</span>
            <div role="radiogroup" aria-labelledby="background-colors" onKeyDown={onPaletteKey} className="flex flex-wrap gap-2.5">
              {BACKGROUND_PALETTES.map(p => {
                const selected = setting.palette === p.value
                return (
                  <button
                    key={p.value}
                    ref={el => {
                      paletteRefs.current[p.value] = el
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => update({ palette: p.value })}
                    className="pattern-choice inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px]"
                  >
                    <span className="inline-flex" aria-hidden>
                      <span className="h-3.5 w-3.5 rounded-full" style={{ background: p.light[0] }} />
                      <span className="-ms-1 h-3.5 w-3.5 rounded-full" style={{ background: p.light[1] }} />
                    </span>
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
