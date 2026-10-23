import { CardWallet, type WalletCard } from '@/components/cards/card-wallet'
import { listAccounts } from '@/lib/db/accounts'
import { accountPath } from '@/lib/accounts/routes'
import { BANK_COLORS } from '@/lib/nav/state'
import { seriesColor } from '@/lib/accounts/colors'

/**
 * Keeps the bank wallet mounted across /banks and /banks/<id>, like the card
 * wallet on /cards (app/cards/layout.tsx): the bank elements move between the
 * navy pocket and an account's page. Other pages under /banks render as before.
 */
export default async function BanksLayout({ children }: { children: React.ReactNode }) {
  const accounts = await listAccounts({ kind: 'BANK', includeArchived: true })
  let active = 0
  const banks: WalletCard[] = accounts.map(a => ({
    id: a.id,
    path: accountPath('BANK', a.id),
    provider: a.provider,
    name: a.displayName,
    lastFour: null,
    network: null,
    // Same colour as the account's series on /banks (archived accounts have none there)
    color: seriesColor(a.color, a.archived ? BANK_COLORS[0] : BANK_COLORS[active++ % BANK_COLORS.length]),
    colorChoice: a.color,
    archived: a.archived,
  }))
  return (
    <CardWallet kind="banks" cards={banks}>
      {children}
    </CardWallet>
  )
}
