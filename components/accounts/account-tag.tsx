/** An account whose rows a combined table holds (the /banks and /cards tables) */
export interface TableAccount {
  id: string
  name: string
  /** Its series colour on the page, as its row in the account list */
  color: string
  /** A card's merchant rules are per provider (they cover every card of the company) */
  provider: string
}

/**
 * The accounts a transactions table covers: its one account (an account's page)
 * or an overview's list. With `several`, each row says whose it is.
 */
export function tableScope(accountId: string | undefined, accounts: TableAccount[] | undefined) {
  const ids = accountId ? [accountId] : (accounts ?? []).map(a => a.id)
  return {
    ids,
    several: ids.length > 1,
    byId: new Map((accounts ?? []).map(a => [a.id, a])),
    /** For an API call: `accountId=` once per account */
    query: ids.map(id => `accountId=${encodeURIComponent(id)}`).join('&'),
  }
}

/** A row's account, in a table spanning several: its colour dot and name */
export function AccountTag({ account }: { account?: TableAccount }) {
  if (!account) return null
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: account.color }} aria-hidden />
      {account.name}
    </span>
  )
}
