import { CardWallet, type WalletCard } from '@/components/cards/card-wallet'
import { listAccounts } from '@/lib/db/accounts'
import { getCardBillingDays } from '@/lib/db/cards'
import { accountPath } from '@/lib/accounts/routes'
import { CARD_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'

/**
 * Keeps the card wallet mounted across /cards and /cards/<id> (ENG-56), so the
 * card elements move between the stack and a card's page instead of being
 * rebuilt. Other pages under /cards render as before.
 */
export default async function CardsLayout({ children }: { children: React.ReactNode }) {
  const accounts = await listAccounts({ kind: 'CREDIT_CARD', includeArchived: true })
  const billingDays = await getCardBillingDays(accounts.filter(a => !a.archived).map(a => a.id))
  let active = 0
  const cards: WalletCard[] = accounts.map(a => ({
    id: a.id,
    path: accountPath('CREDIT_CARD', a.id),
    provider: a.provider,
    name: a.displayName,
    lastFour: a.cardLastFour,
    network: a.cardNetwork,
    // Same colour as the card's series on /cards (archived cards have none there)
    color: seriesColor(a.color, a.archived ? 'var(--chart-cc)' : CARD_COLORS[active++ % CARD_COLORS.length]),
    colorChoice: a.color,
    archived: a.archived,
    billingDay: billingDays[a.id] ?? null,
  }))
  return <CardWallet cards={cards}>{children}</CardWallet>
}
