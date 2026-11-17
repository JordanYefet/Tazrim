'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
 * The strip is promoted to its own layer only while it rolls (no will-change).
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
// Line box of every glyph; the window is exactly one line tall. Rounded to whole
// pixels: digit d sits d rows down the strip, and a fractional row (1.15 × 16px =
// 18.4px) leaves each digit at a different sub-pixel offset, which the browser
// rounds up or down per digit, so neighbours land a pixel apart
const LINE_HEIGHT = 'round(1.15em, 1px)'
// Strong ease-out: fast start, long settle, reads as "rolling into place" (motion tokens, ENG-67)
const EASE = MOTION_EASE.ui
// Soft top/bottom edges so passing digits fade instead of being cut off
const EDGE_MASK = 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)'
const BLUR_ID = 'digit-blur'

/**
 * Motion blur while a strip rolls (SwiftUI's numericText): the strongest at the start, where
 * the ease-out is fastest, and gone well before it settles, so the digit lands sharp.
 * `fromSpin`: the strip was spinning (blurred already, globals.css), so it starts blurred.
 */
function blurRoll(strip: HTMLElement, duration: number, delay: number, fromSpin = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  for (const a of strip.getAnimations()) if (a.id === BLUR_ID) a.cancel()
  const blur = `blur(${ROLL.blur})`
  const a = strip.animate(
    [
      { filter: fromSpin ? blur : 'blur(0)' },
      { filter: blur, offset: 0.12 },
      { filter: 'blur(0)', offset: 0.7 },
      { filter: 'blur(0)' },
    ],
    { duration, delay, easing: 'linear', fill: fromSpin ? 'backwards' : 'none' }
  )
  a.id = BLUR_ID
}

/** A digit's place in a cascade from the highest digit (`index` 0) to the lowest */
export function cascade(index: number, count: number, total: number = ROLL.duration) {
  const duration = Math.max(ROLL.minDuration, total - (count - 1) * ROLL.stagger)
  return { delay: index * ROLL.stagger, duration }
}
// Sign, digits and separators: the part that is laid out character by character
const NUMERIC_CORE = /[-−]?\d(?:[\d.,]*\d)?/

/**
 * A digit that spun while a period loaded (globals.css, `.digit-strip`) lands the
 * way a page's numbers enter: the spin stops, and the strip rolls up from 0 to its
 * digit on the entrance's beat, so the load and the arrival read as one motion.
 * The spin's removal fires `animationcancel`; the plain transition the new digit
 * started is dropped for it. A spin still waiting out its delay never moved, so it
 * changes nothing.
 */
function useSpinLanding(duration: number, delay: number) {
  const ref = useRef<HTMLSpanElement>(null)
  const timing = useRef({ duration, delay })
  timing.current = { duration, delay }
  useEffect(() => {
    const strip = ref.current
    if (!strip) return
    function land(e: AnimationEvent) {
      if (!strip || e.target !== strip || e.animationName !== 'digit-spin' || e.elapsedTime <= 0) return
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const target = strip.style.transform
      for (const a of strip.getAnimations()) if ('transitionProperty' in a) a.cancel()
      const { duration, delay } = timing.current
      strip.animate([{ transform: 'translateY(0%)' }, { transform: target }], {
        duration,
        delay,
        easing: EASE,
        fill: 'backwards',
      })
      blurRoll(strip, duration, delay, true)
    }
    strip.addEventListener('animationcancel', land)
    return () => strip.removeEventListener('animationcancel', land)
  }, [])
  return ref
}

/** One rolling digit; also used for the card digits as they are typed (ENG-56). */
export function DigitStrip({ digit, duration, delay }: { digit: number; duration: number; delay: number }) {
  const strip = useSpinLanding(duration, delay)
  const shown = useRef(digit)
  // A new digit rolls with the blur, on the transform transition's own timing
  useLayoutEffect(() => {
    if (shown.current === digit) return
    shown.current = digit
    if (strip.current) blurRoll(strip.current, duration, delay)
  }, [digit, duration, delay, strip])
  return (
    <span
      className="relative block overflow-hidden"
      style={{ height: LINE_HEIGHT, maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}
    >
      <span
        ref={strip}
        // No will-change: a page holds hundreds of digits, and a permanent layer each
        // (masked, so a render pass each) made every scroll frame redraw them all.
        // The browser still runs the transform transition on the compositor.
        // digit-strip: spins while a period loads (globals.css, main[data-pending])
        className="digit-strip flex flex-col transition-transform motion-reduce:transition-none"
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

/**
 * A digit of a RollingNumber. It renders 0 first and its real digit right
 * before the browser paints (after a forced layout read, so the 0 is the
 * transition's start), so it rolls up from 0 whenever it appears: with the
 * number's first render (the roll starts on the very first frame, in step
 * with the page, ENG-67), and also when a number gains a digit later
 * (0.00 → 12,345.67 rolls the new leading digits too, not only the last three).
 */
function RollingDigit({ digit, duration, delay }: { digit: number; duration: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => {
    ref.current?.getBoundingClientRect()
    setMounted(true)
  }, [])
  return (
    // The loading spin follows the same cascade: a wave from the highest digit (globals.css)
    <span ref={ref} className="contents" style={{ '--digit-lag': `${delay}ms` } as React.CSSProperties}>
      <DigitStrip digit={mounted ? digit : 0} duration={duration} delay={delay} />
    </span>
  )
}

export function RollingNumber({ value, duration = ROLL.duration, format: kind = 'currency', className }: RollingNumberProps) {
  const text = format(value, kind)
  // Amounts are hidden in privacy mode (ENG-127); counts and percentages stay readable. The
  // mark goes on an inner inline span: callers may make the outer one a block, and the
  // privacy bar is the marked element's background
  const money = kind === 'currency' || kind === 'currencyExact' || kind === 'decimal' || undefined
  const match = text.match(NUMERIC_CORE)
  if (!match || match.index === undefined)
    return (
      <span className={className}>
        <span data-money={money}>{text}</span>
      </span>
    )

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  const chars = [...match[0]]
  const count = chars.filter(ch => /\d/.test(ch)).length
  let place = 0

  return (
    <span data-rolling className={cn('tabular-nums', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden data-money={money}>
        {before}
        {/* LTR so the characters keep their order inside the RTL page; the
            symbol and suffix stay in normal text flow around it */}
        <span dir="ltr" className="inline-flex items-baseline" style={{ lineHeight: LINE_HEIGHT }}>
          {chars.map((ch, i) => {
            // Key by position from the right so units stay units when the
            // number of digits changes; unchanged digits don't move
            const fromEnd = chars.length - 1 - i
            return /\d/.test(ch) ? (
              // From the highest digit to the lowest, each a beat after the one before
              <RollingDigit key={`d${fromEnd}`} digit={Number(ch)} {...cascade(place++, count, duration)} />
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
