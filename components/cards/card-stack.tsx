import { PaymentCard } from '@/components/accounts/account-element'
import { cardLabel } from '@/lib/accounts/brands'
import { CardTransitionLink } from './card-transition'

export interface StackCard {
  id: string
  href: string
  provider: string
  name: string
  lastFour: string | null
  network: string | null
  color: string
}

/**
 * The cards as an Apple Wallet style stack (ENG-56): the first card in front,
 * every other one behind it showing its top strip (nickname and issuer). A
 * card opens its page, morphing out of the stack into its tile there.
 * Layout and hover peek: .wallet-stack in app/globals.css.
 *
 * The cards are rendered back to front, so document order is paint order
 * (no z-index juggling). Only the chosen card is named for the transition
 * (components/cards/card-transition.tsx).
 */
export function CardStack({ cards }: { cards: StackCard[] }) {
  const backToFront = [...cards].reverse()
  const stackIds = backToFront.map(c => c.id)
  return (
    <ol className="wallet-stack" aria-label="הכרטיסים">
      {backToFront.map(c => (
        <li key={c.id} className="wallet-stack__item">
          <CardTransitionLink
            href={c.href}
            aria-label={cardLabel({ provider: c.provider, name: c.name, lastFour: c.lastFour, network: c.network })}
            className="wallet-stack__link"
            stackCardId={c.id}
            stackIds={stackIds}
          >
            <PaymentCard
              decorative
              provider={c.provider}
              name={c.name}
              lastFour={c.lastFour}
              network={c.network}
              color={c.color}
            />
          </CardTransitionLink>
        </li>
      ))}
    </ol>
  )
}
