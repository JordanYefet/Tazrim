import type { CSSProperties } from 'react'

/*
 * View-transition names for the card morph between /cards and a card's page
 * (components/cards/card-transition.tsx). Plain functions, so server pages can
 * set them too.
 */

/** A valid CSS ident for a card's transition name. */
export function cardTransitionName(accountId: string): string {
  return `card-${accountId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** Style for the element that morphs: the same name on both pages, one class for every card. */
export function cardTransitionStyle(accountId: string, kind: 'wallet-card' | 'wallet-front' = 'wallet-card'): CSSProperties {
  return { viewTransitionName: cardTransitionName(accountId), viewTransitionClass: kind } as CSSProperties
}
