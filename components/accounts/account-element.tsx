'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { cardLabel, faceFor, isKnownIssuer, issuerWordmark, providerKey, providerLabel, type Face, type FaceKind } from '@/lib/accounts/brands'
import { NetworkMark } from './network-mark'
import { DigitStrip, RollingNumber } from '@/components/ui/rolling-number'
import { MOTION } from '@/lib/motion'
import { formatDate } from '@/lib/utils/date'
import { GlassSurface } from '@/components/glass/glass-surface'

/*
 * The account elements (ENG-56 / ENG-57): a payment card in ISO proportions
 * and a wider bank account statement, one family (same face, material and
 * elevation; styles in app/globals.css under "Account elements").
 */

export function faceStyle(face: Face): CSSProperties {
  return { '--face-a': face.stops[0], '--face-b': face.stops[1], '--face-c': face.stops[2] } as CSSProperties
}

/** Text tone and glass flags for the stylesheet (ENG-66, "Account colours" in app/globals.css). */
function faceData(face: Face) {
  return {
    'data-face': face.key,
    'data-ink': face.ink === 'dark' ? 'dark' : undefined,
    'data-glass': face.glass ? '' : undefined,
  }
}

function Material() {
  return (
    <>
      <span aria-hidden className="acct-material acct-material--base" />
      <span aria-hidden className="acct-material acct-material--sheen" />
      <span aria-hidden className="acct-material acct-material--grain" />
      <span aria-hidden className="acct-material acct-material--light" />
    </>
  )
}

/**
 * A gentle tilt toward a desktop mouse, with a light that follows it. Only for
 * fine pointers that can hover, never under reduced motion; touch gets none.
 * Writes the transform straight to the element (no React state per move).
 */
function useTilt<T extends HTMLElement>(enabled: boolean, maxDeg: number) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !canHover.matches || reduce.matches) return
      const r = el.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.dataset.tilting = ''
        // Follows the pointer closely; the stylesheet's slower transition takes it home on leave
        el.style.transition = 'transform var(--motion-quick) var(--ease-ui)'
        el.style.transform = `perspective(1000px) rotateX(${((0.5 - y) * 2 * maxDeg).toFixed(2)}deg) rotateY(${((x - 0.5) * 2 * maxDeg).toFixed(2)}deg)`
        el.style.setProperty('--light-x', `${(x * 100).toFixed(1)}%`)
        el.style.setProperty('--light-y', `${(y * 100).toFixed(1)}%`)
      })
    }
    const leave = () => {
      cancelAnimationFrame(frame)
      delete el.dataset.tilting
      el.style.transition = ''
      el.style.transform = ''
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      leave()
    }
  }, [enabled, maxDeg])
  return ref
}

/** A digit that rolls in from 0 when it appears and rolls between values when edited. */
function LiveDigit({ digit }: { digit: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(digit))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [digit])
  return (
    <span className="acct-digit-in">
      <DigitStrip digit={shown} duration={MOTION.base} delay={0} />
    </span>
  )
}

function CardDigits({ lastFour, live }: { lastFour: string | null; live: boolean }) {
  if (!live) {
    return (
      <span className="acct-card__digits">
        <span className="acct-card__mask">••••</span>
        {lastFour && <span>{lastFour}</span>}
      </span>
    )
  }
  // While typing: four slots that fill in one digit at a time
  const typed = (lastFour ?? '').slice(0, 4)
  return (
    <span className="acct-card__digits">
      <span className="acct-card__mask">••••</span>
      <span className="acct-card__slots">
        {[0, 1, 2, 3].map(i => {
          const ch = typed[i]
          return ch ? (
            <span key={`d${i}`} className="acct-card__slot">
              <LiveDigit digit={Number(ch)} />
            </span>
          ) : (
            <span key={`e${i}`} className="acct-card__slot is-empty">•</span>
          )
        })}
      </span>
    </span>
  )
}

export interface PaymentCardProps {
  provider: string
  name: string
  lastFour?: string | null
  network?: string | null
  /** The account's own colour, for issuers without a face */
  color?: string
  /** Account.color (ENG-66): a chosen swatch, custom colour or glass; null keeps the brand default */
  colorChoice?: string | null
  /** Shown (dimmed) while the name is empty, in the add form */
  namePlaceholder?: string
  /** The add form's live preview: digits roll in, the network swaps in */
  live?: boolean
  /** Hover tilt on desktop pointers */
  tilt?: boolean
  /** Hidden from assistive tech when the surrounding link already names the card */
  decorative?: boolean
  /**
   * The open card on its page (ENG-56): the period total in the middle band.
   * undefined: no band (every other use). null: the band, still empty.
   */
  amount?: { value: number; label: string } | null
  /** Fades the band in (after the card has settled) and out (before it leaves) */
  amountVisible?: boolean
  /** Glass faces (ENG-72): the baked liquid-glass lens, for large cards only (others get the static look) */
  glassBaked?: boolean
  className?: string
}

/** The card element, sized by its container's width (list, tile or hero). */
export function PaymentCard({
  provider,
  name,
  lastFour = null,
  network = null,
  color,
  colorChoice,
  namePlaceholder,
  live = false,
  tilt = false,
  decorative = false,
  amount,
  amountVisible = false,
  glassBaked = false,
  className,
}: PaymentCardProps) {
  const ref = useTilt<HTMLDivElement>(tilt, 5)
  const face = faceFor('CREDIT_CARD', provider, color, colorChoice)
  const shownName = name.trim() || namePlaceholder || ''
  const wordmark = issuerWordmark(provider)
  // Known issuers get a typeset wordmark; a typed provider is shown as written, quieter
  const knownIssuer = isKnownIssuer(provider)
  // Known issuers: a tone-on-tone pattern of the wordmark for depth. Others: a frosted pane.
  const pattern = knownIssuer ? wordmark : ''

  return (
    <div
      ref={ref}
      dir="ltr"
      className={cn('acct-card acct-face', className)}
      style={faceStyle(face)}
      {...faceData(face)}
      data-frost={knownIssuer || face.glass ? undefined : ''}
      data-amount={amount !== undefined ? '' : undefined}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': cardLabel({ provider, name: shownName, lastFour, network }) })}
    >
      {face.glass ? (
        <GlassSurface baked={glassBaked} />
      ) : (
        <>
          <span aria-hidden className="acct-card__field" />
          {!knownIssuer && <span aria-hidden className="acct-card__frost" />}
          {pattern && (
            <span aria-hidden className="acct-card__pattern">
              {[0, 1, 2].map(row => (
                <span key={row}>{`${pattern} `.repeat(6)}</span>
              ))}
            </span>
          )}
          <span aria-hidden className="acct-material acct-material--grain" />
          <span aria-hidden className="acct-card__rim" />
        </>
      )}
      <span aria-hidden className="acct-material acct-material--light" />
      <div className="acct-card__content">
        <div className="acct-card__row">
          <p className={cn('acct-card__name', !name.trim() && 'is-placeholder')} dir="auto">
            {shownName}
          </p>
          {wordmark && (
            <span key={providerKey(provider)} className={cn('acct-card__wordmark', !knownIssuer && 'is-label', live && 'acct-swap')} dir="auto">
              {wordmark}
            </span>
          )}
        </div>
        {amount !== undefined && (
          <div className="acct-card__amount" data-visible={amountVisible && amount ? '' : undefined} aria-hidden={!amountVisible || !amount}>
            {amount && (
              <>
                <p className="acct-card__amount-label" dir="rtl">{amount.label}</p>
                <p className="acct-card__amount-value">
                  <span className="acct-card__amount-currency">₪</span>
                  <RollingNumber value={amount.value} format="decimal" />
                </p>
              </>
            )}
          </div>
        )}
        <div className="acct-card__row acct-card__row--bottom">
          <CardDigits lastFour={lastFour} live={live} />
          <span key={network ?? 'none'} data-network={network ?? undefined} className={cn('acct-card__network', live && 'acct-swap')}>
            <NetworkMark network={network} />
          </span>
        </div>
      </div>
    </div>
  )
}

/** A tiny face for pills, rows and pickers. Width comes from the className (height follows). */
export function AccountMini({
  kind,
  provider,
  color,
  colorChoice,
  network,
  className,
}: {
  kind: FaceKind
  provider: string
  color?: string
  /** Account.color (ENG-66) */
  colorChoice?: string | null
  /** Cards: the network mark, shown where the face is wide enough */
  network?: string | null
  className?: string
}) {
  const face = faceFor(kind, provider, color, colorChoice)
  if (kind === 'BANK') {
    return (
      <span aria-hidden className={cn('acct-mini acct-mini--bank acct-face', className)} style={faceStyle(face)} {...faceData(face)}>
        {face.glass ? (
          <GlassSurface />
        ) : (
          <span className="acct-mini__band">
            <span className="acct-material acct-material--base" />
            <span className="acct-material acct-material--sheen" />
          </span>
        )}
        <span className="acct-mini__line" />
      </span>
    )
  }
  return (
    <span aria-hidden dir="ltr" className={cn('acct-mini acct-mini--card acct-face', className)} style={faceStyle(face)} {...faceData(face)}>
      {face.glass ? (
        <GlassSurface />
      ) : (
        <>
          <span className="acct-card__field" />
          <span className="acct-card__rim" />
        </>
      )}
      {network && (
        <span className="acct-mini__mark">
          <NetworkMark network={network} />
        </span>
      )}
    </span>
  )
}

/** A small balance trend line. Needs two points or more. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const fillId = `acct-spark-${useId().replace(/:/g, '')}`
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const W = 120
  const H = 36
  const pad = 3
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * W,
    pad + (1 - (p - min) / span) * (H - pad * 2),
  ])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = xy[xy.length - 1]
  return (
    // Time runs left to right, as on the app's charts. The SVG stretches to
    // its box, so the end dot is an HTML dot placed on it (stays round).
    <span className={cn('acct-bank__spark relative block h-9 w-full', className)} aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${fillId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-[hsl(var(--surface-raised))]"
        style={{ left: `${(lx / W) * 100}%`, top: `${(ly / H) * 100}%` }}
      />
    </span>
  )
}

export interface BankElementProps {
  provider: string
  name: string
  color?: string
  /** Account.color (ENG-66) */
  colorChoice?: string | null
  namePlaceholder?: string
  /** Balance after the latest row of the period; undefined when there is none */
  latest?: { balance: number; date: string }
  /** Shown instead of the balance when there is none */
  emptyText?: string
  /** Period income / expense; omitted where the totals sit next to the element */
  totals?: { income: number; expense: number }
  /** Month-end balances, oldest first */
  trend?: number[]
  hero?: boolean
  tilt?: boolean
  /** Glass faces (ENG-72): the baked liquid-glass lens; on by default for the hero */
  glassBaked?: boolean
  /** Inside a link: a plain box without its own label (its text is read as part of the link) */
  plain?: boolean
  className?: string
  /** Extra rows at the bottom of the body (share meter, link label) */
  children?: ReactNode
}

function Total({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' }) {
  const Icon = tone === 'income' ? ArrowDown : ArrowUp
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          tone === 'income' ? 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]' : 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))]'
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ms-auto font-medium tabular-nums">
        <RollingNumber value={value} format="currencyExact" />
      </dd>
    </div>
  )
}

/** The bank account element: bank colour band, display name, the balance as hero. */
export function BankElement({
  provider,
  name,
  color,
  colorChoice,
  namePlaceholder,
  latest,
  emptyText = 'אין תנועות בתקופה',
  totals,
  trend = [],
  hero = false,
  tilt = false,
  glassBaked = hero,
  plain = false,
  className,
  children,
}: BankElementProps) {
  // Typed as a div: <section> adds nothing to HTMLElement that the tilt uses
  const ref = useTilt<HTMLDivElement>(tilt, 2.5)
  const face = faceFor('BANK', provider, color, colorChoice)
  const shownName = name.trim() || namePlaceholder || ''
  const bank = provider ? providerLabel(provider) : ''
  const showTrend = trend.length >= 2
  const Tag = plain ? 'div' : 'section'

  return (
    <Tag
      ref={ref}
      className={cn('acct-bank acct-face transition-transform duration-page ease-ui motion-reduce:transition-none', hero && 'acct-bank--hero', className)}
      style={faceStyle(face)}
      {...faceData(face)}
      aria-label={plain ? undefined : `חשבון בנק${bank ? ` ${bank}` : ''}, ${shownName}`}
    >
      {face.glass && <GlassSurface baked={glassBaked} />}
      <div className="acct-bank__band">
        {!face.glass && <Material />}
        {bank && bank !== shownName && <p className="acct-bank__bank">{bank}</p>}
        <p className={cn('acct-bank__name', !name.trim() && 'is-placeholder')}>
          <bdi>{shownName}</bdi>
        </p>
      </div>
      <div className="acct-bank__body">
        <div>
          <p className="text-xs text-muted-foreground">
            {latest ? `יתרה · ${formatDate(latest.date)}` : 'יתרה'}
          </p>
          {latest ? (
            <p className="acct-bank__balance mt-1 tabular-nums">
              <RollingNumber value={latest.balance} format="currencyExact" />
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{emptyText}</p>
          )}
        </div>
        {(totals || showTrend) && (
          <div className={cn('flex gap-4', hero ? 'flex-col' : 'items-end')}>
            {totals && (
              <dl className="min-w-0 flex-1 space-y-1.5">
                <Total label="הכנסות" value={totals.income} tone="income" />
                <Total label="הוצאות" value={totals.expense} tone="expense" />
              </dl>
            )}
            {showTrend && (
              <div className={cn(totals ? 'w-[38%] shrink-0' : 'w-full')}>
                <Sparkline points={trend} className={hero ? 'h-14' : undefined} />
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </Tag>
  )
}
