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
import { BankElement, PaymentCard } from '@/components/accounts/account-element'
import { RollingNumber } from '@/components/ui/rolling-number'
import { cardLabel } from '@/lib/accounts/brands'
import { withQuery } from '@/lib/accounts/routes'
import { periodQuery } from '@/lib/period'
import { EASE, LAND_AT, MOTION } from '@/lib/motion'
import { useCurrentPeriod } from '@/components/layout/period-context'
import { prebakeGlass, requestGlassBake, showGlassAt } from '@/components/glass/glass-bakery'
import {
  POCKET_HEIGHT_CQW,
  boxHeight,
  placements,
  pocketTop,
  predictCardPlacement,
  springEasing,
  springResponseFor,
  translateYOf,
  walletModeFor,
  type CardPlacement,
  type WalletMode,
} from '@/lib/cards/wallet-motion'

/*
 * The card wallet (ENG-56). app/cards/layout.tsx mounts it once for /cards and
 * /cards/<id>, so the same card elements stay on screen across the two pages
 * and simply move: the stack on /cards, one card open on a card's page.
 * app/banks/layout.tsx mounts the same wallet for the bank accounts
 * (`kind="banks"`): bank elements in a navy pocket on /banks, one open on its page.
 *
 * Motion: the real elements, transform and opacity only, with WAAPI and a
 * spring sampled into a linear() easing (compositor-run, so a busy main
 * thread does not stall it). Every retarget starts from the on-screen value,
 * so a reversal mid-flight never jumps. A tap moves the card at once; the
 * route's data streams in behind it (the page content eases in when ready).
 * The URL is the source of truth, so browser back / forward animate too.
 * prefers-reduced-motion: every change is instant.
 */

/** What the wallet holds: credit cards (/cards) or bank accounts (/banks) */
export type WalletKind = 'cards' | 'banks'

const BASE: Record<WalletKind, string> = { cards: '/cards', banks: '/banks' }

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

// Settles on the page beat (MOTION.page): the content fade, the numbers' roll
// and the charts land with the card (motion tokens, lib/motion.ts)
export const SPRING = springEasing(0.92, springResponseFor(MOTION.page, 0.92))
const FALLBACK_EASING = EASE.spring
// The one deliberate stagger: the other cards follow the chosen one by a hair
const STAGGER_MS = 24

/**
 * Calls `land` when an animation is LAND_AT through (or at once without one),
 * so what appears on the moving card lands with it rather than after it.
 */
function whenLanding(anim: Animation | null, land: () => void) {
  if (!anim) return land()
  const timer = window.setTimeout(land, SPRING.duration * LAND_AT)
  anim.addEventListener('cancel', () => window.clearTimeout(timer))
}
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

/** The `translate` that carries a card across a move of the wallet box on the page, in px (see shiftCard). */
function currentShift(el: HTMLElement): number {
  return translateYOf(getComputedStyle(el).translate)
}

function moveCard(el: HTMLElement, to: CardPlacement, opts: { delay?: number }): Animation | null {
  const cs = getComputedStyle(el)
  // Starts where the card is on screen: its transform, plus any carry (shiftCard)
  // folded in, so moving it again mid-carry never jumps
  const from = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform)
  from.m42 += currentShift(el)
  const fromOpacity = cs.opacity
  for (const a of el.getAnimations()) a.cancel()
  el.style.translate = ''
  el.style.transform = to.transform
  el.style.opacity = String(to.opacity)
  // Glass on a moving card (ENG-72): its baked bitmap travels with it; it is baked again once the card settles
  requestGlassBake()
  if (prefersReducedMotion()) return null
  el.style.willChange = 'transform, opacity, translate'
  // A card appearing or leaving finishes its fade in the first 30% of the
  // motion: half-transparent cards would show the stacked cards through
  // each other. The transform runs the whole spring.
  const fades = Math.abs(Number(fromOpacity) - to.opacity) > 0.01
  const anim = el.animate(
    fades
      ? [
          { transform: from.toString(), opacity: fromOpacity },
          { opacity: String(to.opacity), offset: 0.3 },
          { transform: to.transform, opacity: String(to.opacity) },
        ]
      : [
          { transform: from.toString(), opacity: fromOpacity },
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

const SHIFT_ID = 'wallet-shift'
/** Each running carry's offsets (px), so a foreseen box move can carry it on */
const shifts = new WeakMap<Animation, { from: number; to: number }>()

/**
 * Carries a card (or the pocket) across a move of the wallet box on the page,
 * with `translate` (applied outside the transform), so the card's own motion
 * keeps running untouched: no restart, no lost scale. `by` is how far the box
 * just moved (the card is held where it was on screen); `to` is where the
 * carry rests: 0 (its place in the box), or, ahead of a box move about to
 * happen, that move. Eases on the wallet's spring.
 */
function shiftCard(el: HTMLElement, { by = 0, to = 0 }: { by?: number; to?: number }) {
  // Where the carry is on screen now, before its resting value changes
  const from = currentShift(el) - by
  el.style.translate = Math.abs(to) < 0.5 ? '' : `0 ${to}px`
  const running = el.getAnimations().find(a => a.id === SHIFT_ID)
  const range = running && shifts.get(running)
  // The box moved as foreseen (the carry ahead was heading for this): the
  // same carry runs on in the box's new place, at the same speed (no hitch)
  if (by && running && range && Math.abs(range.to - by - to) < 1 && running.effect instanceof KeyframeEffect) {
    const next = { from: range.from - by, to }
    running.effect.setKeyframes([{ translate: `0 ${next.from}px` }, { translate: `0 ${next.to}px` }])
    shifts.set(running, next)
    return
  }
  running?.cancel()
  if (Math.abs(from - to) < 0.5) return
  requestGlassBake()
  if (prefersReducedMotion()) return
  el.style.willChange = 'transform, opacity, translate'
  const anim = el.animate([{ translate: `0 ${from}px` }, { translate: `0 ${to}px` }], {
    id: SHIFT_ID,
    duration: SPRING.duration,
    easing: supportsLinearEasing() ? SPRING.easing : FALLBACK_EASING,
    fill: 'backwards',
  })
  shifts.set(anim, { from, to })
  anim.addEventListener('finish', () => {
    if (!el.getAnimations().length) el.style.willChange = ''
  })
}

/** The open card's period total, published by its page (the layout gets no search params). */
export interface HeroTotal {
  accountId: string
  value: number
  label: string
  /** A bank account's balance (after the period's latest row) and month-end trend */
  bank?: { latest?: { balance: number; date: string }; trend: number[] }
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

/**
 * Rendered by a bank account's page: puts the period's balance and trend on
 * the open bank element (the wallet in app/banks/layout.tsx), like CardHeroTotal.
 */
export function BankHeroBalance({
  accountId,
  latest,
  trend,
}: {
  accountId: string
  latest?: { balance: number; date: string }
  trend: number[]
}) {
  const set = useContext(HeroTotalContext)
  const key = JSON.stringify([latest, trend])
  useLayoutEffect(() => {
    set({ accountId, value: latest?.balance ?? 0, label: '', bank: { latest, trend } })
    // `key` stands for latest and trend (new arrays on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, accountId, key])
  return null
}

const StackTotalContext = createContext<Dispatch<SetStateAction<number | null>>>(() => {})

/**
 * Rendered by /cards: puts the period's total across all cards on the leather
 * pocket (round 7). A new period updates it in place (the digits roll); the
 * wallet drops it when the stack closes, so a stale total never shows.
 */
export function CardStackTotal({ value }: { value: number }) {
  const set = useContext(StackTotalContext)
  useLayoutEffect(() => {
    set(value)
  }, [set, value])
  return null
}

export function CardWallet({
  cards,
  kind = 'cards',
  children,
}: {
  cards: WalletCard[]
  kind?: WalletKind
  children: ReactNode
}) {
  const base = BASE[kind]
  const pathname = usePathname()
  const router = useRouter()
  const [intent, setIntent] = useState<string | null>(null)
  const [heroTotal, setHeroTotal] = useState<HeroTotal | null>(null)
  const [stackTotal, setStackTotal] = useState<number | null>(null)

  const info = useMemo(() => cards.map(c => ({ id: c.id, archived: c.archived })), [cards])
  const routeMode = walletModeFor(pathname, info, base)
  const mode = intent ? walletModeFor(intent, info, base) : routeMode
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
    router.prefetch(withQuery(base, period))
    for (const c of cards) router.prefetch(withQuery(c.path, period))
  }, [router, cards, period, base])

  if (routeMode.kind === 'none') return <>{children}</>

  return (
    <HeroTotalContext.Provider value={setHeroTotal}>
    <StackTotalContext.Provider value={setStackTotal}>
    <div className="wallet-shell mx-auto max-w-7xl">
      {children}
      <div className="wallet-shell__wallet">
        {/* The box keeps the route's height until the route arrives, so the page
            under it does not jump while the cards are already moving */}
        <Wallet
          kind={kind}
          cards={cards}
          mode={visibleMode}
          heightMode={routeMode}
          period={period}
          heroTotal={heroTotal}
          setHeroTotal={setHeroTotal}
          stackTotal={stackTotal}
          setStackTotal={setStackTotal}
        />
      </div>
    </div>
    </StackTotalContext.Provider>
    </HeroTotalContext.Provider>
  )
}

/**
 * Where the wallet box's top sits on the document in each mode, learned as
 * the pages are visited (the stack page and a card's page have different
 * headings), per wallet width. Used to bake glass for a card's next place
 * ahead of time (ENG-72).
 */
const learnedBoxTop = new Map<string, number>()
const boxKey = (kind: WalletMode['kind'], width: number) => `${kind}:${Math.round(width)}`

function Wallet({
  kind,
  cards,
  mode,
  heightMode,
  period,
  heroTotal,
  setHeroTotal,
  stackTotal,
  setStackTotal,
}: {
  kind: WalletKind
  cards: WalletCard[]
  mode: WalletMode
  heightMode: WalletMode
  period: Record<string, string>
  heroTotal: HeroTotal | null
  setHeroTotal: Dispatch<SetStateAction<HeroTotal | null>>
  stackTotal: number | null
  setStackTotal: Dispatch<SetStateAction<number | null>>
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
  // The leather pocket: in place for the stack, dropped away and faded on a card's page
  const pocketRef = useRef<HTMLDivElement>(null)
  // While the pocket fades away its total keeps the last figure (no roll to 0 behind the fade)
  const [lastStackTotal, setLastStackTotal] = useState(0)
  if (stackTotal !== null && stackTotal !== lastStackTotal) setLastStackTotal(stackTotal)
  const pocketPlace = (m: WalletMode): CardPlacement => ({
    transform: m.kind === 'stack' ? 'translate3d(0, 0, 0)' : 'translate3d(0, 28px, 0)',
    opacity: m.kind === 'stack' ? 1 : 0,
    hidden: m.kind !== 'stack',
    zIndex: cards.length + 1,
    front: false,
  })
  const [initialPocket] = useState(() => pocketPlace(mode))
  const lastMode = useRef(mode)
  const lastTop = useRef<number | null>(null)
  // The open card shows its total as it lands (from LAND_AT of its motion), and hides it as soon as it moves
  const [settledId, setSettledId] = useState<string | null>(mode.kind === 'open' ? mode.id : null)

  // Glass cards (ENG-72): each card's glass is baked ahead for its stack and
  // open places, so whichever card is chosen has its glass from the first frame
  const glassHost = (id: string) => elements.current.get(id)?.querySelector<HTMLElement>('.acct-face[data-glass]') ?? null
  const boxFor = (m: WalletMode) => {
    const b = boxRef.current
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + window.scrollX, y: learnedBoxTop.get(boxKey(m.kind, r.width)) ?? r.top + window.scrollY, width: r.width }
  }

  // Mode changed: move every card from where it is now to its new place
  useLayoutEffect(() => {
    const prev = lastMode.current
    lastMode.current = mode
    if (prev.kind === mode.kind && (prev.kind !== 'open' || mode.kind !== 'open' || prev.id === mode.id)) return
    // The total belongs to one card: drop another card's (a page that already
    // published this card's total, e.g. on back / forward, keeps it)
    const openId = mode.kind === 'open' ? mode.id : null
    setHeroTotal(t => (t && t.accountId === openId ? t : null))
    // The pocket's total belongs to the stack on screen: drop it when the stack closes
    if (mode.kind !== 'stack') setStackTotal(null)
    setSettledId(null)
    // The pocket drops away with the other cards (or rises back with them)
    if (pocketRef.current) moveCard(pocketRef.current, pocketPlace(mode), {})
    // Glass cards show the glass baked for where they are going, from the start of the motion
    const nextBox = boxFor(mode)
    if (nextBox) {
      for (const c of cards) {
        const host = glassHost(c.id)
        const to = host && predictCardPlacement(mode, c.id, stackOrder, nextBox)
        if (host && to) showGlassAt(host, to)
      }
    }
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
        whenLanding(anim, () => setSettledId(openId))
      }
    }
    for (const c of cards) {
      if (stackOrder.includes(c.id)) continue
      const el = elements.current.get(c.id)
      const to = place.get(c.id)
      if (el && to) moveCard(el, to, {})
    }
    // Ahead of the route (a tap): if the box is known to sit elsewhere in the
    // new mode (the pages' headings differ), the cards head straight for their
    // place there; when the route arrives and the box moves, the carry is
    // already there (the effect below), so there is no second motion
    const box = boxRef.current
    if (box && heightMode.kind !== mode.kind && !prefersReducedMotion()) {
      const r = box.getBoundingClientRect()
      const learned = learnedBoxTop.get(boxKey(mode.kind, r.width))
      const ahead = learned === undefined ? 0 : learned - (r.top + window.scrollY)
      if (Math.abs(ahead) >= 0.5) {
        for (const el of [pocketRef.current, ...elements.current.values()]) if (el) shiftCard(el, { to: ahead })
      }
    }
  }, [mode, place, stackOrder, cards, heightMode.kind])

  // The wallet itself moved on the page (the new page's heading is taller or
  // shorter): carry the cards across so they don't jump, then let them settle
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const top = box.getBoundingClientRect().top + window.scrollY
    const prevTop = lastTop.current
    lastTop.current = top
    // The route has caught up: this is where the box sits in this mode
    if (heightMode.kind === mode.kind) learnedBoxTop.set(boxKey(mode.kind, box.getBoundingClientRect().width), top)
    if (prevTop === null || Math.abs(top - prevTop) < 0.5) return
    // Hold every card where it is on screen and let the carry ease out; their
    // own motion (if any) runs on untouched
    const by = top - prevTop
    for (const el of [pocketRef.current, ...elements.current.values()]) if (el) shiftCard(el, { by })
  })

  // Bake every glass card's stack and open places in idle time (cached, so only once)
  useEffect(() => {
    const t = window.setTimeout(() => {
      for (const c of cards) {
        const host = glassHost(c.id)
        if (!host) continue
        for (const m of [{ kind: 'stack' } as const, { kind: 'open', id: c.id } as const]) {
          const b = boxFor(m)
          const p = b && predictCardPlacement(m, c.id, stackOrder, b)
          if (p) prebakeGlass(host, c.id, p)
        }
      }
    }, 250)
    return () => window.clearTimeout(t)
    // glassHost / boxFor read refs; the places change with these
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, heightMode.kind, stackOrder, cards])

  const shownTotal =
    mode.kind === 'open' && heroTotal?.accountId === mode.id && settledId === mode.id ? heroTotal : null

  return (
    <div className="wallet" data-mode={mode.kind} data-kind={kind}>
      <div ref={boxRef} className="wallet__box" style={{ height: boxHeight(heightMode, stackOrder.length) }}>
        {cards.map(c => {
          const p = place.get(c.id)!
          const first = initial.get(c.id) ?? p
          const isOpen = mode.kind === 'open' && mode.id === c.id
          const total = isOpen && heroTotal?.accountId === c.id ? heroTotal : null
          const href = withQuery(isOpen ? BASE[kind] : c.path, period)
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
                aria-label={
                  kind === 'banks'
                    ? isOpen ? 'כל החשבונות' : `חשבון ${c.name}`
                    : isOpen ? 'כל הכרטיסים' : cardLabel({ provider: c.provider, name: c.name, lastFour: c.lastFour, network: c.network })
                }
                onClick={e => {
                  if (isPlainClick(e)) announceWalletRoute(href)
                }}
              >
                {kind === 'banks' ? (
                  // Card-shaped in the wallet (CSS); the band is the strip that shows in the stack.
                  // Open, it shows the balance its page published (nothing until then)
                  <BankElement
                    plain
                    hero
                    tilt={isOpen}
                    provider={c.provider}
                    name={c.name}
                    color={c.color}
                    colorChoice={c.colorChoice}
                    latest={isOpen ? total?.bank?.latest : undefined}
                    trend={isOpen ? (total?.bank?.trend ?? []) : []}
                    emptyText={isOpen && total ? 'אין תנועות בתקופה' : ''}
                  />
                ) : (
                <PaymentCard
                  decorative
                  tilt={isOpen}
                  glassBaked
                  glassId={c.id}
                  amount={isOpen ? (total ? { value: total.value, label: total.label } : null) : undefined}
                  amountVisible={isOpen && !!total && settledId === c.id}
                  provider={c.provider}
                  name={c.name}
                  lastFour={c.lastFour}
                  network={c.network}
                  color={c.color}
                  colorChoice={c.colorChoice}
                />
                )}
              </Link>
            </div>
          )
        })}
        {stackOrder.length > 0 && (
          <div
            ref={pocketRef}
            className="wallet-pocket"
            style={{
              top: pocketTop(stackOrder.length),
              height: `${POCKET_HEIGHT_CQW}cqw`,
              transform: initialPocket.transform,
              opacity: initialPocket.opacity,
              zIndex: cards.length + 1,
              pointerEvents: mode.kind === 'stack' ? undefined : 'none',
            }}
            aria-hidden={mode.kind !== 'stack' || undefined}
          >
            <div className="wallet-pocket__leather">
              <div className="wallet-pocket__body wallet-pocket__deboss">
                <p className="wallet-pocket__label">{kind === 'banks' ? 'יתרה בכל החשבונות' : 'סה״כ חיובים בכל הכרטיסים'}</p>
                {/* Hidden until the page gives the total; on the first visit it rolls up from 0, later from the last total */}
                <p className="wallet-pocket__total wallet-pocket__totalwrap" data-visible={stackTotal !== null ? '' : undefined}>
                  <span className="wallet-pocket__currency">₪</span>
                  <RollingNumber value={stackTotal ?? lastStackTotal} format="decimal" />
                </p>
              </div>
              <div className="wallet-pocket__foot wallet-pocket__deboss">
                <span className="wallet-pocket__chip">
                  {kind === 'banks'
                    ? stackOrder.length === 1 ? 'חשבון אחד' : `${stackOrder.length} חשבונות`
                    : stackOrder.length === 1 ? 'כרטיס אחד' : `${stackOrder.length} כרטיסים`}
                </span>
                <span className="wallet-pocket__mark" aria-hidden>
                  תזרים
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* The open card's total for screen readers (its face is decorative). No caption
          under the wallet: the pages beside it carry the text, on cards and banks alike */}
      {shownTotal && kind === 'cards' && (
        <p className="sr-only">
          {shownTotal.label}: {shownTotal.value.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        </p>
      )}
    </div>
  )
}
