'use client'

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type SetStateAction,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PaymentCard } from '@/components/accounts/account-element'
import { cardLabel } from '@/lib/accounts/brands'
import { withQuery } from '@/lib/accounts/routes'
import { periodQuery } from '@/lib/period'
import { useCurrentPeriod } from '@/components/layout/period-context'
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
  /** Account.color (ENG-66) */
  colorChoice: string | null
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

function moveCard(el: HTMLElement, to: CardPlacement, opts: { delay?: number; fromY?: number }): Animation | null {
  const cs = getComputedStyle(el)
  const from = opts.fromY !== undefined ? `translate3d(0, ${opts.fromY}px, 0)` : cs.transform === 'none' ? 'translate3d(0, 0, 0)' : cs.transform
  const fromOpacity = cs.opacity
  for (const a of el.getAnimations()) a.cancel()
  el.style.transform = to.transform
  el.style.opacity = String(to.opacity)
  if (prefersReducedMotion()) return null
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
  anim.addEventListener('finish', () => {
    if (!el.getAnimations().length) el.style.willChange = ''
  })
  return anim
}

/** The open card's period total, published by its page (the layout gets no search params). */
export interface HeroTotal {
  accountId: string
  value: number
  label: string
}

const HeroTotalContext = createContext<Dispatch<SetStateAction<HeroTotal | null>>>(() => {})

/**
 * Rendered by a card's page: puts the period total on the open card. A new
 * period updates it in place (the digits roll); the wallet drops it when the
 * card closes or another card opens, so a stale total is never shown.
 */
export function CardHeroTotal({ accountId, value, label }: HeroTotal) {
  const set = useContext(HeroTotalContext)
  useLayoutEffect(() => {
    set({ accountId, value, label })
  }, [set, accountId, value, label])
  return null
}

export function CardWallet({ cards, children }: { cards: WalletCard[]; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [intent, setIntent] = useState<string | null>(null)
  const [heroTotal, setHeroTotal] = useState<HeroTotal | null>(null)

  const info = useMemo(() => cards.map(c => ({ id: c.id, archived: c.archived })), [cards])
  const routeMode = walletModeFor(pathname, info)
  const mode = intent ? walletModeFor(intent, info) : routeMode
  // Keep the open card while the stack is shown elsewhere (no flicker on a stray intent)
  const visibleMode: WalletMode = mode.kind === 'none' ? routeMode : mode

  // The period on screen (URL first, else the remembered one, ENG-63), so the
  // cards' links and prefetches always name it
  const current = useCurrentPeriod()
  const period: Record<string, string> = useMemo(() => periodQuery(current), [current])

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
    <HeroTotalContext.Provider value={setHeroTotal}>
    <div className="wallet-shell mx-auto max-w-7xl">
      {children}
      <div className="wallet-shell__wallet">
        {/* The box keeps the route's height until the route arrives, so the page
            under it does not jump while the cards are already moving */}
        <Wallet
          cards={cards}
          mode={visibleMode}
          heightMode={routeMode}
          period={period}
          heroTotal={heroTotal}
          setHeroTotal={setHeroTotal}
        />
      </div>
    </div>
    </HeroTotalContext.Provider>
  )
}

function Wallet({
  cards,
  mode,
  heightMode,
  period,
  heroTotal,
  setHeroTotal,
}: {
  cards: WalletCard[]
  mode: WalletMode
  heightMode: WalletMode
  period: Record<string, string>
  heroTotal: HeroTotal | null
  setHeroTotal: Dispatch<SetStateAction<HeroTotal | null>>
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
  // The open card shows its total once it has settled in place (and hides it as soon as it moves)
  const [settledId, setSettledId] = useState<string | null>(mode.kind === 'open' ? mode.id : null)

  // Mode changed: move every card from where it is now to its new place
  useLayoutEffect(() => {
    const prev = lastMode.current
    lastMode.current = mode
    if (prev.kind === mode.kind && (prev.kind !== 'open' || mode.kind !== 'open' || prev.id === mode.id)) return
    // The total belongs to one card: drop another card's (a page that already
    // published this card's total, e.g. on back / forward, keeps it)
    const openId = mode.kind === 'open' ? mode.id : null
    setHeroTotal(t => (t && t.accountId === openId ? t : null))
    setSettledId(null)
    // Leaving the stack, the cards nearest the chosen one go first; coming back, the same
    const order = mode.kind === 'open' ? [...stackOrder].reverse() : stackOrder
    let k = 0
    for (const id of order) {
      const el = elements.current.get(id)
      const to = place.get(id)
      if (!el || !to) continue
      const moving = mode.kind === 'open' ? id === mode.id : prev.kind === 'open' && id === prev.id
      const anim = moveCard(el, to, { delay: moving ? 0 : STAGGER_MS * k++ })
      if (openId && id === openId) {
        if (anim) anim.addEventListener('finish', () => setSettledId(openId))
        else setSettledId(openId)
      }
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
      if (!to) continue
      const anim = moveCard(el, to, { fromY: currentY(el) - shift })
      // This replaces the open card's running motion, so it now says when the card has settled
      if (mode.kind === 'open' && id === mode.id) {
        const openId = mode.id
        if (anim) anim.addEventListener('finish', () => setSettledId(openId))
        else setSettledId(openId)
      }
    }
  })

  const shownTotal =
    mode.kind === 'open' && heroTotal?.accountId === mode.id && settledId === mode.id ? heroTotal : null

  return (
    <div className="wallet" data-mode={mode.kind}>
      <div ref={boxRef} className="wallet__box" style={{ height: boxHeight(heightMode, stackOrder.length) }}>
        {cards.map(c => {
          const p = place.get(c.id)!
          const first = initial.get(c.id) ?? p
          const isOpen = mode.kind === 'open' && mode.id === c.id
          const total = isOpen && heroTotal?.accountId === c.id ? heroTotal : null
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
                  amount={isOpen ? (total ? { value: total.value, label: total.label } : null) : undefined}
                  amountVisible={isOpen && !!total && settledId === c.id}
                  provider={c.provider}
                  name={c.name}
                  lastFour={c.lastFour}
                  network={c.network}
                  color={c.color}
                  colorChoice={c.colorChoice}
                />
              </Link>
            </div>
          )
        })}
      </div>
      {heightMode.kind === 'open' && (
        // Under the open card: its total for screen readers (the face is decorative) and where it is paid from
        <p className="wallet__caption" data-visible={shownTotal ? '' : undefined}>
          {shownTotal && (
            <span className="sr-only">
              {shownTotal.label}: {shownTotal.value.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}.{' '}
            </span>
          )}
          נגבה מחשבון הבנק, ולכן כבר כלול בהוצאות הבנק
        </p>
      )}
    </div>
  )
}
