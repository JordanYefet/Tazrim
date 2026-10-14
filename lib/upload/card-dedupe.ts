/**
 * When is an uploaded card row "already imported"?
 *
 * MAX repeats the original purchase date and the same amount on every monthly
 * installment ("תשלום N מתוך M"), so date + merchant + amount alone makes
 * installment 3 of one statement look like installment 4 of the next, and the
 * import used to drop it. A row is the same charge only if it also has the
 * same billing date and the same installment number.
 *
 * Matching is one-to-one: a charge that appears twice in a file and once in the
 * account adds one row, and re-uploading a statement adds none.
 */

export interface CardKeyFields {
  transactionDate: Date
  billingDate: Date
  originalMerchantName: string
  chargedAmount: number
  notes: string | null
}

const INSTALLMENT = /תשלום\s+(\d+)\s+מתוך\s+(\d+)/

export function installmentOf(notes: string | null | undefined): { number: number; of: number } | null {
  const m = INSTALLMENT.exec(notes ?? '')
  return m ? { number: Number(m[1]), of: Number(m[2]) } : null
}

/** A calendar day in local time (the parsers build dates at local midnight). */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function cardDedupeKey(row: CardKeyFields): string {
  const inst = installmentOf(row.notes)
  return [
    localDay(row.transactionDate),
    row.originalMerchantName.trim(),
    row.chargedAmount.toFixed(2),
    localDay(row.billingDate),
    inst ? `${inst.number}/${inst.of}` : '',
  ].join('|')
}

export interface ImportPlan {
  /** Indexes of incoming rows to create */
  create: number[]
  /** Incoming rows that match a stored row, with the row they matched */
  skip: { index: number; matchedId: string }[]
}

/**
 * Which incoming rows are new. Each stored row can absorb one incoming row;
 * `force` lists incoming rows to create even if they match.
 */
export function planCardImport(
  incoming: CardKeyFields[],
  stored: (CardKeyFields & { id: string })[],
  force: number[] = []
): ImportPlan {
  const available = new Map<string, string[]>()
  for (const s of stored) {
    const key = cardDedupeKey(s)
    available.set(key, [...(available.get(key) ?? []), s.id])
  }
  const forced = new Set(force)
  const plan: ImportPlan = { create: [], skip: [] }
  incoming.forEach((row, index) => {
    if (forced.has(index)) return plan.create.push(index)
    const ids = available.get(cardDedupeKey(row))
    const matchedId = ids?.shift()
    if (matchedId) plan.skip.push({ index, matchedId })
    else plan.create.push(index)
  })
  return plan
}
