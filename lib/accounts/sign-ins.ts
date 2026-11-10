/**
 * Which saved sign-in brings each account's data in, so the account itself
 * shows it ("מסונכרן · נשמר בכספת") and one sign-in can cover several
 * accounts (a MAX login brings two cards).
 *
 * A sign-in covers the account it names (BankCredential.accountId) and, when
 * it is its company's only sign-in, every account the company's sync is
 * linked to (SyncLink). With two sign-ins for one company (one per card), the
 * links can't tell them apart, so each covers only the account it names.
 */

export interface SignInRow {
  id: string
  company: string
  label: string
  accountId: string | null
  updatedAt: string
}

export interface LinkRow {
  company: string
  accountId: string | null
  ignored: boolean
  lastSyncedAt: string | null
}

export interface AccountSignIn {
  credentialId: string
  company: string
  label: string
  updatedAt: string
  /** The newest sync of the accounts it covers */
  lastSyncedAt: string | null
  /** Every account it covers, this one included, oldest link first */
  accountIds: string[]
}

export function matchSignIns(signIns: SignInRow[], links: LinkRow[]): Map<string, AccountSignIn> {
  const out = new Map<string, AccountSignIn>()
  const byCompany = new Map<string, SignInRow[]>()
  for (const s of signIns) byCompany.set(s.company, [...(byCompany.get(s.company) ?? []), s])

  for (const [company, rows] of byCompany) {
    const live = links.filter(l => l.company === company && !l.ignored && l.accountId)
    for (const s of rows) {
      const ids: string[] = []
      if (s.accountId) ids.push(s.accountId)
      if (rows.length === 1) for (const l of live) if (!ids.includes(l.accountId!)) ids.push(l.accountId!)
      const times = live.filter(l => ids.includes(l.accountId!) && l.lastSyncedAt).map(l => l.lastSyncedAt!)
      const signIn: AccountSignIn = {
        credentialId: s.id,
        company,
        label: s.label,
        updatedAt: s.updatedAt,
        lastSyncedAt: times.length ? times.reduce((a, b) => (a > b ? a : b)) : null,
        accountIds: ids,
      }
      // The first saved sign-in wins an account two of them name
      for (const id of ids) if (!out.has(id)) out.set(id, signIn)
    }
  }
  return out
}
