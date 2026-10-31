import { prisma, type Db } from './client'
import { listGenericDescriptions } from './generic-descriptions'
import { directionOf } from '../insights/bank-categories'
import {
  keywordMatches,
  normalizeKeyword,
  resolveRuleCategory,
  ruleKindOf,
  validKeyword,
  MIN_KEYWORD_LENGTH,
  type CategoryKindName,
  type KeywordRule,
  type RuleRow,
} from '../insights/keyword-rules'

// Contains-text category rules (lib/insights/keyword-rules.ts has the order they apply
// in). Every write here runs in one transaction and recomputes the rows the change can
// reach: non-manual rows whose text contains the pattern. Rows are matched in JS, with
// the same comparison the resolver uses (SQLite's LIKE folds ASCII case only).

export class KeywordRuleError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export interface StoredKeywordRule extends KeywordRule {
  id: string
}

/** Every rule whose category exists, with that category's kind */
export async function loadKeywordRules(db: Db = prisma): Promise<StoredKeywordRule[]> {
  const [rules, categories] = await Promise.all([
    db.categoryKeywordRule.findMany({ orderBy: { createdAt: 'asc' } }),
    db.category.findMany({ select: { name: true, kind: true } }),
  ])
  const kindOf = new Map(categories.map(c => [c.name, c.kind]))
  return rules.flatMap(r => {
    const kind = kindOf.get(r.category)
    return kind ? [{ id: r.id, pattern: r.pattern, category: r.category, kind, createdAt: r.createdAt }] : []
  })
}

/** Every rule, for the categories page */
export async function listKeywordRules() {
  return prisma.categoryKeywordRule.findMany({ orderBy: [{ category: 'asc' }, { pattern: 'asc' }] })
}

/**
 * For rows an exact rule no longer covers: the category the contains rules give one
 * (null when none matches, or the row never takes one).
 */
export async function keywordFallback(db: Db): Promise<(row: RuleRow) => string | null> {
  const rules = await loadKeywordRules(db)
  return row => resolveRuleCategory(row, null, rules)
}

const key = (...parts: string[]) => parts.join('\u0000')

/** The exact rules of every provider, as the resolver's `exact` lookups */
async function exactRules(db: Db) {
  const [aliases, bankRules, generic] = await Promise.all([
    db.transactionAlias.findMany({ where: { categoryOverride: { not: null } } }),
    db.bankCategoryRule.findMany(),
    listGenericDescriptions(db),
  ])
  const cards = new Map(aliases.map(a => [key(a.provider, a.originalName), a.categoryOverride!]))
  const bank = new Map(bankRules.map(r => [key(r.provider, r.direction, r.originalDescription), r.category]))
  return { cards, bank, generic: new Set(generic) }
}

type Exact = Awaited<ReturnType<typeof exactRules>>

interface CardCandidate {
  id: string
  provider: string
  categoryOverride: string | null
  categoryManual: boolean
  row: RuleRow & { source: 'card' }
}
interface BankCandidate {
  id: string
  provider: string
  category: string | null
  categoryManual: boolean
  row: RuleRow & { source: 'bank' }
}

/** Card charges and bank rows whose text passes `match` (every account) */
async function candidates(db: Db, match: (text: string) => boolean, exact: Exact) {
  const accounts = await db.account.findMany({ select: { id: true, provider: true } })
  const providerOf = new Map(accounts.map(a => [a.id, a.provider]))
  const [cardRows, bankRows] = await Promise.all([
    db.creditCardTransaction.findMany({
      select: { id: true, accountId: true, originalMerchantName: true, categoryOverride: true, categoryManual: true },
    }),
    db.bankTransaction.findMany({
      select: {
        id: true, accountId: true, originalDescription: true, description: true,
        debit: true, credit: true, category: true, categoryManual: true,
      },
    }),
  ])
  const cards: CardCandidate[] = cardRows
    .filter(r => match(r.originalMerchantName))
    .map(r => ({
      id: r.id,
      provider: providerOf.get(r.accountId) ?? '',
      categoryOverride: r.categoryOverride,
      categoryManual: r.categoryManual,
      row: { source: 'card', originalMerchantName: r.originalMerchantName },
    }))
  const bank: BankCandidate[] = bankRows
    .filter(r => match(r.originalDescription))
    .map(r => ({
      id: r.id,
      provider: providerOf.get(r.accountId) ?? '',
      category: r.category,
      categoryManual: r.categoryManual,
      row: {
        source: 'bank',
        originalDescription: r.originalDescription,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
        generic: exact.generic.has(r.originalDescription),
      },
    }))
  return { cards, bank }
}

const cardExact = (exact: Exact, c: CardCandidate) => exact.cards.get(key(c.provider, c.row.originalMerchantName)) ?? null
const bankExact = (exact: Exact, b: BankCandidate) =>
  b.row.generic ? null : exact.bank.get(key(b.provider, directionOf(b.row), b.row.originalDescription)) ?? null

export interface RecomputeResult {
  /** Card charges whose override changed */
  cardIds: string[]
  /** Bank rows whose category changed */
  bankIds: string[]
}

/** Writes `value` to every listed row, one updateMany per value */
async function writeGrouped(ids: Map<string | null, string[]>, write: (value: string | null, ids: string[]) => Promise<unknown>) {
  for (const [value, list] of ids) if (list.length) await write(value, list)
}

/**
 * Gives every non-manual row whose text passes `match` the category the rules give it
 * now (exact ?? contains ?? none), and returns the rows that changed. On a card, "none"
 * clears the override, so the issuer's category shows again.
 */
export async function recomputeRuleCategories(db: Db, match: (text: string) => boolean): Promise<RecomputeResult> {
  const [exact, rules] = await Promise.all([exactRules(db), loadKeywordRules(db)])
  const { cards, bank } = await candidates(db, match, exact)

  const cardWrites = new Map<string | null, string[]>()
  for (const c of cards) {
    if (c.categoryManual) continue
    const next = resolveRuleCategory(c.row, cardExact(exact, c), rules)
    if (next !== c.categoryOverride) cardWrites.set(next, [...(cardWrites.get(next) ?? []), c.id])
  }
  const bankWrites = new Map<string | null, string[]>()
  for (const b of bank) {
    // Card payments and generic descriptions keep what they have (none, or a pick)
    if (b.categoryManual || !ruleKindOf(b.row)) continue
    const next = resolveRuleCategory(b.row, bankExact(exact, b), rules)
    if (next !== b.category) bankWrites.set(next, [...(bankWrites.get(next) ?? []), b.id])
  }

  await writeGrouped(cardWrites, (value, ids) =>
    db.creditCardTransaction.updateMany({ where: { id: { in: ids } }, data: { categoryOverride: value } })
  )
  await writeGrouped(bankWrites, (value, ids) =>
    db.bankTransaction.updateMany({ where: { id: { in: ids } }, data: { category: value } })
  )
  return { cardIds: [...cardWrites.values()].flat(), bankIds: [...bankWrites.values()].flat() }
}

export interface KeywordPreview {
  /** Rows of the pattern's kind whose text contains it */
  matches: number
  /** Of those, the rows the rule would set: not picked by hand, no exact rule of their own */
  applies: number
}

/**
 * How many rows a pattern reaches for a category of `kind`: card charges and bank debits
 * (EXPENSE) or bank credits (INCOME). Card payments and generic descriptions don't count.
 */
export async function previewKeywordRule(pattern: string, kind: CategoryKindName, db: Db = prisma): Promise<KeywordPreview> {
  if (!validKeyword(pattern)) return { matches: 0, applies: 0 }
  const exact = await exactRules(db)
  const { cards, bank } = await candidates(db, text => keywordMatches(pattern, text), exact)
  let matches = 0
  let applies = 0
  for (const c of kind === 'EXPENSE' ? cards : []) {
    matches++
    if (!c.categoryManual && !cardExact(exact, c)) applies++
  }
  for (const b of bank) {
    if (ruleKindOf(b.row) !== kind) continue
    matches++
    if (!b.categoryManual && !bankExact(exact, b)) applies++
  }
  return { matches, applies }
}

/** A rule saved from a row's window: that row follows the rules from now on */
export interface FromRow {
  source: 'card' | 'bank'
  id: string
}

export interface SaveKeywordResult extends RecomputeResult {
  rule: { id: string; pattern: string; category: string; createdAt: Date }
}

/**
 * Saves a rule (`id`: edits that one; otherwise the rule with the same pattern, any
 * case, is updated, or a new one made) and recomputes the rows the old and the new
 * pattern reach. `fromRow` stops counting that row as picked by hand first.
 */
export async function saveKeywordRule(params: {
  id?: string
  pattern: string
  category: string
  fromRow?: FromRow
}): Promise<SaveKeywordResult> {
  const pattern = normalizeKeyword(params.pattern)
  if (!validKeyword(pattern)) throw new KeywordRuleError(`צריך לפחות ${MIN_KEYWORD_LENGTH} תווים`, 400)

  return prisma.$transaction(async db => {
    const category = await db.category.findUnique({ where: { name: params.category } })
    if (!category) throw new KeywordRuleError('קטגוריה לא קיימת', 400)

    const all = await db.categoryKeywordRule.findMany()
    const same = all.find(r => r.pattern.toLowerCase() === pattern.toLowerCase())
    const editing = params.id ? all.find(r => r.id === params.id) : same
    if (params.id && !editing) throw new KeywordRuleError('לא נמצא', 404)
    if (same && editing && same.id !== editing.id) throw new KeywordRuleError('יש כבר כלל עם הטקסט הזה', 400)

    if (params.fromRow) await releaseRow(db, params.fromRow, category.kind)

    const rule = editing
      ? await db.categoryKeywordRule.update({ where: { id: editing.id }, data: { pattern, category: params.category } })
      : await db.categoryKeywordRule.create({ data: { pattern, category: params.category } })
    const before = editing?.pattern
    const result = await recomputeRuleCategories(db, text => keywordMatches(pattern, text) || (!!before && keywordMatches(before, text)))
    return { rule, ...result }
  })
}

/** Lets the row a rule was saved from follow the rules (after checking it can take the category) */
async function releaseRow(db: Db, from: FromRow, kind: CategoryKindName) {
  if (from.source === 'card') {
    const row = await db.creditCardTransaction.findUnique({ where: { id: from.id }, select: { id: true } })
    if (!row) throw new KeywordRuleError('לא נמצא', 404)
    if (kind !== 'EXPENSE') throw new KeywordRuleError('לחיוב בכרטיס מתאימה קטגוריית הוצאה', 400)
    await db.creditCardTransaction.update({ where: { id: from.id }, data: { categoryManual: false } })
    return
  }
  const row = await db.bankTransaction.findUnique({ where: { id: from.id } })
  if (!row) throw new KeywordRuleError('לא נמצא', 404)
  const generic = await db.genericDescription.count({ where: { description: row.originalDescription } })
  const takes = ruleKindOf({ source: 'bank', ...row, generic: generic > 0 })
  if (!takes) throw new KeywordRuleError('לתנועה הזאת אין כלל אוטומטי: הקטגוריה נשמרת לה בלבד', 400)
  if (takes !== kind) {
    throw new KeywordRuleError(takes === 'EXPENSE' ? 'לתנועה יוצאת מתאימה קטגוריית הוצאה' : 'לתנועה נכנסת מתאימה קטגוריית הכנסה', 400)
  }
  await db.bankTransaction.update({ where: { id: from.id }, data: { categoryManual: false } })
}

/** Removes rules (by id) and recomputes the rows they reached: an exact rule, another contains rule, or none */
export async function deleteKeywordRules(ids: string[], db?: Db): Promise<RecomputeResult> {
  const run = async (tx: Db) => {
    const gone = await tx.categoryKeywordRule.findMany({ where: { id: { in: ids } } })
    if (!gone.length) return { cardIds: [], bankIds: [] }
    await tx.categoryKeywordRule.deleteMany({ where: { id: { in: gone.map(r => r.id) } } })
    return recomputeRuleCategories(tx, text => gone.some(r => keywordMatches(r.pattern, text)))
  }
  return db ? run(db) : prisma.$transaction(run)
}
