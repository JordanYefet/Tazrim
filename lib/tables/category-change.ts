/**
 * A category change on the rows a table has loaded, shown before the server answers
 * (React's useOptimistic, hooks/use-optimistic-rows.ts): which rows it reaches and
 * what it does to each. The reach of a rule is the table's guess, the same rule the
 * server applies; the server's answer (the ids it changed) then replaces the guess.
 * Pure, so the guesses are tested.
 */
export interface RowChange<T> {
  hits: (row: T) => boolean
  patch: (row: T) => T
}

/** `rows` with the change applied to the rows it hits (the others keep their identity) */
export function applyChange<T>(rows: readonly T[], change: RowChange<T>): T[] {
  return rows.map(r => (change.hits(r) ? change.patch(r) : r))
}

/** The rows with these ids (a bulk save, or the server's answer) */
export function idsChange<T extends { id: string }>(ids: Iterable<string>, patch: (row: T) => T): RowChange<T> {
  const set = new Set(ids)
  return { hits: r => set.has(r.id), patch }
}

export type CardScope = 'row' | 'merchant' | 'contains'

/**
 * Which loaded card charges a save reaches. 'row': the charge. 'merchant': every charge
 * of the merchant at the same company (the server's merchant rule covers the company's
 * cards, not every card listed). 'contains': the charge itself, until the server says
 * which rows the text rule reached.
 */
export function cardChangeHits<T extends { id: string; originalMerchantName: string }>(
  target: T,
  scope: CardScope,
  companyOf: (row: T) => string
): (row: T) => boolean {
  if (scope !== 'merchant') return row => row.id === target.id
  const company = companyOf(target)
  return row => row.originalMerchantName === target.originalMerchantName && companyOf(row) === company
}

export type BankScope = 'row' | 'rule' | 'contains'

export interface BankChangeRow {
  id: string
  originalDescription: string
  debit: number
  credit: number
  /** The row's category was picked for it alone; a rule leaves it be */
  categoryManual: boolean
}

/**
 * Which loaded bank rows a save reaches. 'row': the row. 'rule': the rows with the same
 * original description going the same way (money out or in) that have no category of
 * their own, and the row itself. 'contains': the row itself, until the server answers.
 */
export function bankChangeHits<T extends BankChangeRow>(target: T, scope: BankScope): (row: T) => boolean {
  if (scope !== 'rule') return row => row.id === target.id
  const out = target.debit > 0
  return row =>
    row.id === target.id ||
    (row.originalDescription === target.originalDescription && row.debit > 0 === out && !row.categoryManual)
}

export interface ResultChangeRow {
  id: string
  source: string
  accountId: string
  description: string
  originalDescription?: string
}

/**
 * Which loaded combined rows (search results, a category's month) a save reaches: the
 * row, and with a wide scope (a bank rule, a card merchant) the rows of the same
 * account with the same original text.
 */
export function resultChangeHits<T extends ResultChangeRow>(target: T, wide: boolean): (row: T) => boolean {
  const text = target.originalDescription ?? target.description
  return row =>
    (row.source === target.source && row.id === target.id) ||
    (wide && row.source === target.source && row.accountId === target.accountId && (row.originalDescription ?? row.description) === text)
}

/** `source:id`, the key a combined row is known by */
export const resultKey = (r: Pick<ResultChangeRow, 'source' | 'id'>) => `${r.source}:${r.id}`

/** The combined rows with these `source:id` keys (the server's answer to a bulk or text-rule save) */
export function keysChange<T extends Pick<ResultChangeRow, 'source' | 'id'>>(keys: Iterable<string>, patch: (row: T) => T): RowChange<T> {
  const set = new Set(keys)
  return { hits: r => set.has(resultKey(r)), patch }
}
