'use client'

import { useLayoutEffect, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cardTransitionName, cardTransitionStyle } from '@/lib/accounts/card-transition-name'

export { cardTransitionName, cardTransitionStyle }

/*
 * Shared-element transition between the /cards stack and a card's page (ENG-56).
 *
 * Only the chosen card carries a view-transition-name, on both pages: the
 * card page's tile always has it, and in the stack it is set on the chosen
 * card just before the transition starts (going in) or while the stack page
 * renders (coming back). The rest of the stack stays inside the page
 * snapshot, so the cards keep covering each other correctly while the page
 * cross-fades. The browser morphs the chosen card between its two places.
 *
 * The navigation runs inside document.startViewTransition; the new page's
 * <CardTransitionSettled /> ends the update as soon as React has committed it
 * (with a time cap, so a slow page never holds the old one frozen for long).
 *
 * Fallbacks: no View Transitions API, or prefers-reduced-motion, means a
 * plain navigation. Modified clicks (new tab etc.) are left to the browser.
 */

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> }
}

// Longest the old page stays frozen while the new one loads
const SETTLE_CAP_MS = 1200

let settlePending: (() => void) | null = null
let settleTimer: ReturnType<typeof setTimeout> | undefined
/** The card being moved by the running transition (read while the new page renders). */
let activeCardId: string | null = null

function settle() {
  clearTimeout(settleTimer)
  const done = settlePending
  settlePending = null
  done?.()
}

function canTransition(): boolean {
  if (typeof document === 'undefined') return false
  if (!(document as ViewTransitionDocument).startViewTransition) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The account id of a /cards/<id> path, if it is one. */
function cardIdOf(path: string): string | null {
  const m = path.match(/^\/cards\/([^/?#]+)\/?(?:[?#]|$)/)
  if (!m || m[1] === 'categories' || m[1] === 'max') return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

export function useCardNavigate() {
  const router = useRouter()
  return (href: string) => {
    if (!canTransition()) {
      router.push(href)
      return
    }
    settle()
    // Going to a card: that card. Coming back to the stack: the card we leave.
    activeCardId = cardIdOf(href) ?? cardIdOf(window.location.pathname)
    if (activeCardId) {
      // In the stack, name the chosen card now so the old snapshot has it
      const el = document.querySelector<HTMLElement>(`[data-stack-card="${CSS.escape(activeCardId)}"]`)
      if (el) Object.assign(el.style, cardTransitionStyle(activeCardId))
    }
    const transition = (document as ViewTransitionDocument).startViewTransition!(
      () =>
        new Promise<void>(resolve => {
          settlePending = resolve
          settleTimer = setTimeout(settle, SETTLE_CAP_MS)
          router.push(href)
        })
    )
    transition.finished.finally(() => {
      activeCardId = null
    })
  }
}

/** Rendered by both pages: ends a pending transition once the page has committed. */
export function CardTransitionSettled() {
  useLayoutEffect(() => {
    settle()
  }, [])
  return null
}

/**
 * A Link that navigates through the card transition (a normal Link when
 * `transition` is false). `stackCardId`: this link is a card in the stack, the
 * element that morphs when its card is the one moving. `stackIds`: the stack,
 * back to front; while a card returns, the cards in front of its slot are
 * named too, so they layer above it and it slides in under them.
 */
export function CardTransitionLink({
  href,
  transition = true,
  stackCardId,
  stackIds,
  className,
  style,
  children,
  ref,
  ...rest
}: {
  ref?: Ref<HTMLAnchorElement>
  href: string
  transition?: boolean
  stackCardId?: string
  stackIds?: string[]
  className?: string
  style?: CSSProperties
  children: ReactNode
  'aria-label'?: string
  'aria-current'?: 'page' | undefined
}) {
  const navigate = useCardNavigate()
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!transition || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
  }
  // Coming back to the stack: the returning card (and the cards in front of it) are named while the new page renders
  let transitionStyle: CSSProperties | undefined
  if (stackCardId !== undefined && activeCardId !== null) {
    const at = stackIds?.indexOf(activeCardId) ?? -1
    if (stackCardId === activeCardId) transitionStyle = cardTransitionStyle(stackCardId)
    else if (at >= 0 && (stackIds?.indexOf(stackCardId) ?? -1) > at) transitionStyle = cardTransitionStyle(stackCardId, 'wallet-front')
  }
  return (
    <Link
      ref={ref}
      href={href}
      className={className}
      style={transitionStyle ? { ...style, ...transitionStyle } : style}
      onClick={onClick}
      data-stack-card={stackCardId}
      {...rest}
    >
      {children}
    </Link>
  )
}
