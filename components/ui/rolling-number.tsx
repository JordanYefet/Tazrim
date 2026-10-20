'use client'

import { useEffect, useState } from 'react'
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
// Strong ease-out: fast start, long settle — reads as "rolling into place"
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'
// Lower digits start first, odometer-style
const STAGGER_MS = 30
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
  /** Roll duration per digit, in ms */
  duration?: number
  format?: RollingFormat
  className?: string
}

export function RollingNumber({ value, duration = 650, format: kind = 'currency', className }: RollingNumberProps) {
  // Server render and first client paint show zeros; after the browser has
  // painted that frame we switch to the real digits, which triggers the roll.
  const [rolled, setRolled] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRolled(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])

  const text = format(value, kind)
  const match = text.match(NUMERIC_CORE)
  if (!match || match.index === undefined) return <span className={className}>{text}</span>

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  const chars = [...match[0]]

  return (
    <span className={cn('tabular-nums', className)}>
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
                duration={duration}
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
