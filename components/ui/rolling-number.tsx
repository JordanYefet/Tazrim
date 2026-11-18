'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ROLL } from '@/lib/motion'
import { BLUR_LEVELS, ROLL_EASE, blurFilter, landing, rollBlur, rowTransform, spinStart, spinTurn } from '@/lib/digit-motion'
import { cn } from '@/lib/utils/cn'
import { prefersReducedMotion } from '@/lib/a11y/media'

/*
 * Apple-style rolling digits (SwiftUI `.contentTransition(.numericText())`).
 *
 * Each digit is a fixed-height window (overflow: hidden) over a vertical strip
 * of 0–9 and a second 0. Showing digit d means translating the strip up by d of its
 * 11 rows: translateY(-d * 100/11 %). Percentages in translate() are relative
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

// 0–9 and a second 0, so a spin wraps from 9 to 0 without a jump (lib/digit-motion.ts)
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
// Line box of every glyph; the window is exactly one line tall. Rounded to whole
// pixels: digit d sits d rows down the strip, and a fractional row (1.15 × 16px =
// 18.4px) leaves each digit at a different sub-pixel offset, which the browser
// rounds up or down per digit, so neighbours land a pixel apart
const LINE_HEIGHT = 'round(1.15em, 1px)'
// Soft top/bottom edges so passing digits fade instead of being cut off
const EDGE_MASK = 'linear-gradient(to bottom, transparent 0, #000 18%, #000 82%, transparent 100%)'
const BLUR_ID = 'digit-blur'

/** A digit's place in a cascade from the highest digit (`index` 0) to the lowest */
export function cascade(index: number, count: number, total: number = ROLL.duration) {
  const duration = Math.max(ROLL.minDuration, total - (count - 1) * ROLL.stagger)
  return { delay: index * ROLL.stagger, duration }
}
// Sign, digits and separators: the part that is laid out character by character
const NUMERIC_CORE = /[-−]?\d(?:[\d.,]*\d)?/

const reducedMotion = () => prefersReducedMotion()
const now = () => Number(document.timeline.currentTime ?? performance.now())

/**
 * How a strip moves (option C, lib/digit-motion.ts): the blur follows the speed.
 *  - A new digit rolls on ROLL_EASE (a CSS transition on the inline transform), blurred
 *    as it speeds up and sharp as it settles.
 *  - While a period loads (globals.css: `digit-pending` starts after 400 ms, a beat later
 *    per digit), the strip spins from the digit it shows, speeding up from rest.
 *  - When the new figures arrive (the digit changes, or the period stops loading), the
 *    spin carries on forward at its speed and slows onto the digit after its place in
 *    the cascade, the blur clearing as it slows.
 */
function useDigitMotion(digit: number, duration: number, delay: number) {
  const ref = useRef<HTMLSpanElement>(null)
  const timing = useRef({ duration, delay })
  timing.current = { duration, delay }
  const shown = useRef(digit)
  const spin = useRef<{ from: number; start: number; anims: Animation[] } | null>(null)

  const land = useRef((to: number) => {
    const el = ref.current
    const s = spin.current
    if (!el || !s) return
    spin.current = null
    const spun = now() - s.start
    for (const a of s.anims) a.cancel()
    // getAnimations() also brings in the transition the new digit started: the landing replaces it
    for (const a of el.getAnimations()) if ('transitionProperty' in a || a.id === BLUR_ID) a.cancel()
    const plan = landing(s.from, spun, to, timing.current.delay, timing.current.duration)
    el.animate(plan.transform, { duration: plan.duration, easing: 'linear' })
    el.animate(plan.filter, { duration: plan.duration, easing: 'linear' }).id = BLUR_ID
  })

  useLayoutEffect(() => {
    const from = shown.current
    if (from === digit) return
    shown.current = digit
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || reducedMotion()) return
    if (spin.current) return land.current(digit)
    for (const a of el.getAnimations()) if (a.id === BLUR_ID) a.cancel()
    el.animate(rollBlur(from, digit, duration), { duration, delay, easing: 'linear' }).id = BLUR_ID
  }, [digit, duration, delay])

  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    function started(e: AnimationEvent) {
      if (!el || e.target !== el || e.animationName !== 'digit-pending' || spin.current || reducedMotion()) return
      const from = shown.current
      for (const a of el.getAnimations()) if (a.id === BLUR_ID) a.cancel()
      const ramp = spinStart(from)
      const turn = spinTurn(from)
      spin.current = {
        from,
        start: now(),
        anims: [
          el.animate(ramp.transform, { duration: ramp.duration, easing: 'linear', fill: 'forwards' }),
          el.animate(ramp.filter, { duration: ramp.duration, easing: 'linear', fill: 'forwards' }),
          el.animate(turn.transform, { duration: turn.duration, delay: ramp.duration, easing: 'linear', iterations: Infinity }),
          el.animate([{ filter: blurFilter(BLUR_LEVELS) }, { filter: blurFilter(BLUR_LEVELS) }], {
            duration: turn.duration,
            delay: ramp.duration,
            iterations: Infinity,
          }),
        ],
      }
    }
    function stopped(e: AnimationEvent) {
      if (e.target === el && e.animationName === 'digit-pending') land.current(shown.current)
    }
    el.addEventListener('animationstart', started)
    el.addEventListener('animationcancel', stopped)
    el.addEventListener('animationend', stopped)
    return () => {
      el.removeEventListener('animationstart', started)
      el.removeEventListener('animationcancel', stopped)
      el.removeEventListener('animationend', stopped)
    }
  }, [])
  return ref
}

/** One rolling digit; also used for the card digits as they are typed (ENG-56). */
export function DigitStrip({ digit, duration, delay }: { digit: number; duration: number; delay: number }) {
  const strip = useDigitMotion(digit, duration, delay)
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
          transform: rowTransform(digit),
          transitionDuration: `${duration}ms`,
          transitionDelay: `${delay}ms`,
          transitionTimingFunction: ROLL_EASE,
        }}
      >
        {DIGITS.map((d, i) => (
          <span key={i} style={{ height: LINE_HEIGHT }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

/**
 * The vertical blur levels the digits use while they roll (lib/digit-motion.ts): a Gaussian
 * blur along y only, so a digit's sides stay sharp. Sized by the strip itself
 * (objectBoundingBox), so it scales with the number's font size. Rendered once, in the layout.
 */
export function RollBlurDefs() {
  // At full speed: ROLL.blurEm of the digit, over a strip DIGITS.length rows of 1.15em
  const full = ROLL.blurEm / (DIGITS.length * 1.15)
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      {Array.from({ length: BLUR_LEVELS }, (_, k) => (
        <filter
          key={k}
          id={`roll-blur-${k + 1}`}
          primitiveUnits="objectBoundingBox"
          x="0"
          width="1"
          y="-0.02"
          height="1.04"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation={`0 ${(((k + 1) / BLUR_LEVELS) * full).toFixed(5)}`} />
        </filter>
      ))}
    </svg>
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
