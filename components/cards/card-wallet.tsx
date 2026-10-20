'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PaymentCard } from '@/components/accounts/account-element'
import { cardLabel } from '@/lib/accounts/brands'
import { withQuery } from '@/lib/accounts/routes'
import {
  boxHeight,
  placements,
  springEasing,
  walletModeFor,
  type CardPlacement,
  type WalletMode,
} from '@/lib/cards/wallet-motion'

/*
 * The card wallet (ENG-56). app/cards/layout.tsx mounts it once for /cards and
 * /cards/<id>, so the same card elements stay on screen across the two pages
 * and simply move: the stack on /cards, one card open on a card's page.
 *
 * Motion: the real elements, transform and opacity only, with WAAPI and a
 * spring sampled into a linear() easing (compositor-run, so a busy main
 * thread does not stall it). Every retarget starts from the on-screen value,
 * so a reversal mid-flight never jumps. A tap moves the card at once; the
 * route's data streams in behind it (the page content eases in when ready).
 * The URL is the source of truth, so browser back / forward animate too.
 * prefers-reduced-motion: every change is instant.
 */

export interface WalletCard {
  id: string
  /** The card's page, without query (the period is added here) */
  path: string
  provider: string
  name: string
  lastFour: string | null
  network: string | null
  color: string
  archived: boolean
}

const SPRING = springEasing(0.92, 0.36)
const FALLBACK_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'
const STAGGER_MS = 32
const INTENT_EVENT = 'tazrim:wallet-route'

function supportsLinearEasing(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Tell the wallet where a navigation is going, so it can move before the page arrives. */
export function announceWalletRoute(href: string) {
  window.dispatchEvent(new CustomEvent(INTENT_EVENT, { detail: href }))
}

function isPlainClick(e: MouseEvent) {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * A Link into or out of the wallet (stack rows, the phone pills, the back
 * link): the wallet starts moving on tap. `wallet={false}` makes it a plain Link.
 */
export function WalletLink({
  href,
  wallet = true,
  className,
  children,
  ref,
  ...rest
}: {
  href: string
  wallet?: boolean
  className?: string
  children: ReactNode
  ref?: Ref<HTMLAnchorElement>
  'aria-label'?: string
  'aria-current'?: 'page' | undefined
}) {
  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      scroll={wallet ? false : undefined}
      onClick={e => {
        if (wallet && isPlainClick(e)) announceWalletRoute(href)
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}

/** Current vertical offset of an element's transform, in px (0 for none). */
function currentY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return 0
  return new DOMMatrixReadOnly(t).m42
}

function moveCard(el: HTMLElement, to: CardPlacement, opts: { delay?: number; fromY?: number }) {
  const cs = getComputedStyle(el)
  const from = opts.fromY !== undefined ? `translate3d(0, ${opts.fromY}px, 0)` : cs.transform === 'none' ? 'translate3d(0, 0, 0)' : cs.transform
  const fromOpacity = cs.opacity
  for (const a of el.getAnimations()) a.cancel()
  el.style.transform = to.transform
  el.style.opacity = String(to.opacity)
  if (prefersReducedMotion()) return
  el.style.willChange = 'transform, opacity'
  // A card appearing or leaving finishes its fade in the first 30% of the
  // motion: half-transparent cards would show the stacked cards through
  // each other. The transform runs the whole spring.
  const fades = Math.abs(Number(fromOpacity) - to.opacity) > 0.01
  const anim = el.animate(
    fades
      ? [
          { transform: from, opacity: fromOpacity },
          { opacity: String(to.opacity), offset: 0.3 },
          { transform: to.transform, opacity: String(to.opacity) },
        ]
      : [
          { transform: from, opacity: fromOpacity },
          { transform: to.transform, opacity: String(to.opacity) },
        ],
    {
      duration: SPRING.duration,
      easing: supportsLinearEasing() ? SPRING.easing : FALLBACK_EASING,
      delay: opts.delay ?? 0,
      fill: 'backwards',
    }
  )
  anim.onfinish = () => {
    if (!el.getAnimations().length) el.style.willChange = ''
  }
}

export function CardWallet({ cards, children }: { cards: WalletCard[]; children: ReactNode }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const [intent, setIntent] = useState<string | null>(null)

  const info = useMemo(() => cards.map(c => ({ id: c.id, archived: c.archived })), [cards])
  const routeMode = walletModeFor(pathname, info)
  const mode = intent ? walletModeFor(intent, info) : routeMode
  // Keep the open card while the stack is shown elsewhere (no flicker on a stray intent)
  const visibleMode: WalletMode = mode.kind === 'none' ? routeMode : mode

  const period = useMemo(() => {
    const p: Record<string, string> = {}
    const year = params.get('year')
    const month = params.get('month')
    if (year) p.year = year
    if (month) p.month = month
    return p
  }, [params])

  // A tap (here or on a pill / list row / back link) moves the wallet at once
  useEffect(() => {
    function onIntent(e: Event) {
      const href = (e as CustomEvent<string>).detail
      setIntent(href)
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }
    window.addEventListener(INTENT_EVENT, onIntent)
    return () => window.removeEventListener(INTENT_EVENT, onIntent)
  }, [])
  // The route caught up (or back / forward moved it): the URL decides again
  useEffect(() => {
    setIntent(null)
  }, [pathname])

  // Every card's page (and the stack) is one tap away: fetch them ahead
  useEffect(() => {
    router.prefetch(withQuery('/cards', period))
    for (const c of cards) router.prefetch(withQuery(c.path, period))
  }, [router, cards, period])

  if (routeMode.kind === 'none') return <>{children}</>

  return (
    <div className="wallet-shell mx-auto max-w-7xl">
      {children}
      <div className="wallet-shell__wallet">
        {/* The box keeps the route's height until the route arrives, so the page
            under it does not jump while the cards are already moving */}
        <Wallet cards={cards} mode={visibleMode} heightMode={routeMode} period={period} />
      </div>
    </div>
  )
}

function Wallet({
  cards,
  mode,
  heightMode,
  period,
}: {
  cards: WalletCard[]
  mode: WalletMode
  heightMode: WalletMode
  period: Record<string, string>
}) {
  // Back to front: the first (oldest) card is in front, so it comes last
  const stackOrder = useMemo(() => cards.filter(c => !c.archived).map(c => c.id).reverse(), [cards])
  const info = useMemo(() => cards.map(c => ({ id: c.id, archived: c.archived })), [cards])
  const place = useMemo(() => placements(mode, info, stackOrder), [mode, info, stackOrder])

  // Server render and first paint use the first mode's positions as React
  // styles; after that the positions are driven imperatively (so React never
  // overwrites a running animation's starting point).
  const [initial] = useState(() => place)
  const elements = useRef(new Map<string, HTMLDivElement>())
  const boxRef = useRef<HTMLDivElement>(null)
  const lastMode = useRef(mode)
  const lastTop = useRef<number | null>(null)

  // Mode changed: move every card from where it is now to its new place
  useLayoutEffect(() => {
    const prev = lastMode.current
    lastMode.current = mode
    if (prev.kind === mode.kind && (prev.kind !== 'open' || mode.kind !== 'open' || prev.id === mode.id)) return
    // Leaving the stack, the cards nearest the chosen one go first; coming back, the same
    const order = mode.kind === 'open' ? [...stackOrder].reverse() : stackOrder
    let k = 0
    for (const id of order) {
      const el = elements.current.get(id)
      const to = place.get(id)
      if (!el || !to) continue
      const moving = mode.kind === 'open' ? id === mode.id : prev.kind === 'open' && id === prev.id
      moveCard(el, to, { delay: moving ? 0 : STAGGER_MS * k++ })
    }
    for (const c of cards) {
      if (stackOrder.includes(c.id)) continue
      const el = elements.current.get(c.id)
      const to = place.get(c.id)
      if (el && to) moveCard(el, to, {})
    }
  }, [mode, place, stackOrder, cards])

  // The wallet itself moved on the page (the new page's heading is taller or
  // shorter): carry the cards across so they don't jump, then let them settle
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const top = box.getBoundingClientRect().top + window.scrollY
    const prevTop = lastTop.current
    lastTop.current = top
    if (prevTop === null || Math.abs(top - prevTop) < 0.5 || prefersReducedMotion()) return
    const shift = top - prevTop
    for (const [id, el] of elements.current) {
      const to = place.get(id)
      if (to) moveCard(el, to, { fromY: currentY(el) - shift })
    }
  })

  return (
    <div className="wallet" data-mode={mode.kind}>
      <div ref={boxRef} className="wallet__box" style={{ height: boxHeight(heightMode, stackOrder.length) }}>
        {cards.map(c => {
          const p = place.get(c.id)!
          const first = initial.get(c.id) ?? p
          const isOpen = mode.kind === 'open' && mode.id === c.id
          const href = withQuery(isOpen ? '/cards' : c.path, period)
          return (
            <div
              key={c.id}
              ref={el => {
                if (el) elements.current.set(c.id, el)
                else elements.current.delete(c.id)
              }}
              className="wallet-card"
              style={{ transform: first.transform, opacity: first.opacity, zIndex: p.zIndex }}
              data-hidden={p.hidden ? '' : undefined}
              data-front={p.front ? '' : undefined}
              aria-hidden={p.hidden || undefined}
            >
              <Link
                href={href}
                scroll={false}
                tabIndex={p.hidden ? -1 : undefined}
                className="wallet-card__link"
                aria-label={isOpen ? 'כל הכרטיסים' : cardLabel({ provider: c.provider, name: c.name, lastFour: c.lastFour, network: c.network })}
                onClick={e => {
                  if (isPlainClick(e)) announceWalletRoute(href)
                }}
              >
                <PaymentCard
                  decorative
                  tilt={isOpen}
                  provider={c.provider}
                  name={c.name}
                  lastFour={c.lastFour}
                  network={c.network}
                  color={c.color}
                />
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
