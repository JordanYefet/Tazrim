import { CardWallet, type WalletCard } from '@/components/cards/card-wallet'
import { listAccounts } from '@/lib/db/accounts'
import { accountPath } from '@/lib/accounts/routes'
import { CARD_COLORS } from '@/lib/nav/state'

/**
 * Keeps the card wallet mounted across /cards and /cards/<id> (ENG-56), so the
 * card elements move between the stack and a card's page instead of being
 * rebuilt. Other pages under /cards render as before.
 */
export default async function CardsLayout({ children }: { children: React.ReactNode }) {
  const accounts = await listAccounts({ kind: 'CREDIT_CARD', includeArchived: true })
  let active = 0
  const cards: WalletCard[] = accounts.map(a => ({
    id: a.id,
    path: accountPath('CREDIT_CARD', a.id),
    provider: a.provider,
    name: a.displayName,
    lastFour: a.cardLastFour,
    network: a.cardNetwork,
    // Same colour as the card's series on /cards (archived cards have none there)
    color: a.archived ? 'var(--chart-cc)' : CARD_COLORS[active++ % CARD_COLORS.length],
    archived: a.archived,
  }))
  return <CardWallet cards={cards}>{children}</CardWallet>
}
