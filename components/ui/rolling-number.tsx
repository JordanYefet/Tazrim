'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { EASE as MOTION_EASE, ROLL } from '@/lib/motion'
import { cn } from '@/lib/utils/cn'

/*
 * Apple-style rolling digits (SwiftUI `.contentTransition(.numericText())`).
 *
 * Each digit is a fixed-height window (overflow: hidden) over a vertical strip
 * of 0–9. Showing digit d means translating the strip up by d tenths of its
 * own height: translateY(-d * 10%). Percentages in translate() are relative
 * to the element itself, so this holds at any font size. Changing the digit
 * only changes the transform, so the browser animates it on the compositor.
 */

const FORMATTERS = {
  currency: new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }),
  currencyExact: new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2 }),
  integer: new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }),
  // An amount without the currency sign, for layouts that set the ₪ themselves
  decimal: new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
}

export type RollingFormat = 'currency' | 'currencyExact' | 'integer' | 'decimal' | 'percent'

function format(value: number, kind: RollingFormat) {
  if (kind === 'percent') return `${FORMATTERS.integer.format(value)}%`
  return FORMATTERS[kind].format(value)
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
// Line box of every glyph; the window is exactly one line tall
const LINE_HEIGHT = '1.15em'
// Strong ease-out: fast start, long settle, reads as "rolling into place" (motion tokens, ENG-67)
const EASE = MOTION_EASE.ui
// Lower digits start a hair earlier, odometer-style, but every digit lands on the same beat
const STAGGER_MS = ROLL.stagger
// Soft top/bottom edges so passing digits fade instead of being cut off
const EDGE_MASK = 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)'
// Sign, digits and separators: the part that is laid out character by character
const NUMERIC_CORE = /[-−]?\d(?:[\d.,]*\d)?/

/** One rolling digit; also used for the card digits as they are typed (ENG-56). */
export function DigitStrip({ digit, duration, delay }: { digit: number; duration: number; delay: number }) {
  return (
    <span
      className="relative block overflow-hidden"
      style={{ height: LINE_HEIGHT, maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
    >
      <span
        className="flex flex-col transition-transform will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translateY(${-digit * 10}%)`,
          transitionDuration: `${duration}ms`,
          transitionDelay: `${delay}ms`,
          transitionTimingFunction: EASE,
        }}
      >
        {DIGITS.map(d => (
          <span key={d} style={{ height: LINE_HEIGHT }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

interface RollingNumberProps {
  value: number
  /** Roll duration (the last digit lands at this time), in ms; defaults to the page beat */
  duration?: number
  format?: RollingFormat
  className?: string
}

export function RollingNumber({ value, duration = ROLL.duration, format: kind = 'currency', className }: RollingNumberProps) {
  // The server render and the first client render show zeros. Before the
  // browser paints, the zeros' styles are resolved (a forced layout read) and
  // the real digits are set, so the roll starts on the very first frame, in
  // step with the rest of the page (no frame-waiting delay, ENG-67).
  const ref = useRef<HTMLSpanElement>(null)
  const [rolled, setRolled] = useState(false)
  useLayoutEffect(() => {
    ref.current?.getBoundingClientRect()
    setRolled(true)
  }, [])

  const text = format(value, kind)
  const match = text.match(NUMERIC_CORE)
  if (!match || match.index === undefined) return <span className={className}>{text}</span>

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  const chars = [...match[0]]

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {before}
        {/* LTR so the characters keep their order inside the RTL page; the
            symbol and suffix stay in normal text flow around it */}
        <span dir="ltr" className="inline-flex items-baseline" style={{ lineHeight: LINE_HEIGHT }}>
          {chars.map((ch, i) => {
            // Key by position from the right so units stay units when the
            // number of digits changes; unchanged digits don't move
            const fromEnd = chars.length - 1 - i
            return /\d/.test(ch) ? (
              <DigitStrip
                key={`d${fromEnd}`}
                digit={rolled ? Number(ch) : 0}
                // Shorter by its delay, so all digits land together
                duration={Math.max(duration / 2, duration - fromEnd * STAGGER_MS)}
                delay={fromEnd * STAGGER_MS}
              />
            ) : (
              <span key={`s${fromEnd}`}>{ch}</span>
            )
          })}
        </span>
        {after}
      </span>
    </span>
  )
}
