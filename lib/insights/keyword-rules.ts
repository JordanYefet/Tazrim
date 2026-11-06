/**
 * Contains-text category rules (CategoryKeywordRule): "every transaction whose text
 * contains ACME MUSIC is שירותי תקשורת", for charges whose merchant name carries a new id
 * each time, so no exact rule can catch them all.
 *
 * Which category a rule gives a row, in order:
 *   1. a category picked on the row by hand (the callers skip those rows)
 *   2. a contains rule limited to one merchant or description (`merchant`) that matches:
 *      it names both the business and the text, so it is the most specific
 *   3. a contains rule that matches the row's notes: a note names the payee of a
 *      generic charge ("BIT" transfers), so it is more specific than the merchant
 *   4. the exact rule: a merchant rule (cards) or a description rule (bank)
 *   5. a contains rule that matches the merchant or description
 *   6. none: the issuer's category on a card, uncategorised on the bank
 *
 * Within a step the longest pattern wins; on a tie, the oldest rule. A rule's `scope`
 * says where its text is looked for: the merchant or description (NAME), the notes
 * (NOTES), or either (ANY, the default).
 *
 * A rule's category kind decides its rows: an expense one covers card charges and
 * bank debits, an income one bank credits. The bank's card payments and generic
 * descriptions (cheques, transfers) never take one.
 */
import { CATEGORY_KIND_OF, directionOf, isCardPaymentRow } from './bank-categories'

export type CategoryKindName = 'EXPENSE' | 'INCOME'

/** Where a contains rule looks for its text */
export type KeywordScope = 'ANY' | 'NAME' | 'NOTES'
export const KEYWORD_SCOPES: KeywordScope[] = ['ANY', 'NAME', 'NOTES']
export const isKeywordScope = (v: unknown): v is KeywordScope => KEYWORD_SCOPES.includes(v as KeywordScope)

export interface KeywordRule {
  /** Stored normalised (normalizeKeyword) */
  pattern: string
  category: string
  /** The kind of `category`; a rule whose category no longer exists is left out by the loader */
  kind: CategoryKindName
  createdAt: Date
  /** Where the text is looked for; ANY when not set */
  scope?: KeywordScope
  /** Only rows whose merchant or description is exactly this (any case); null: every row */
  merchant?: string | null
}

/** The shortest pattern a rule may have: one letter would match nearly everything */
export const MIN_KEYWORD_LENGTH = 2

/** Trimmed, with inner whitespace collapsed to one space: how a pattern is stored and compared */
export function normalizeKeyword(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** The form both sides are compared in: normalised and lower-cased */
const folded = (text: string) => normalizeKeyword(text).toLowerCase()

/** Whether a normalised pattern is long enough to save */
export function validKeyword(pattern: string): boolean {
  return normalizeKeyword(pattern).length >= MIN_KEYWORD_LENGTH
}

/** Whether `text` contains `pattern`, ignoring case and runs of whitespace */
export function keywordMatches(pattern: string, text: string): boolean {
  const p = folded(pattern)
  return p.length >= MIN_KEYWORD_LENGTH && folded(text).includes(p)
}

/** The rule that wins for a text among the rules of one kind: the longest pattern, then the oldest */
export function keywordRuleFor<R extends KeywordRule>(text: string, rules: R[], kind: CategoryKindName): R | null {
  let best: R | null = null
  for (const r of rules) {
    if (r.kind !== kind || !keywordMatches(r.pattern, text)) continue
    if (
      !best ||
      r.pattern.length > best.pattern.length ||
      (r.pattern.length === best.pattern.length && r.createdAt.getTime() < best.createdAt.getTime())
    ) {
      best = r
    }
  }
  return best
}

/** A row as the resolver sees it */
export type RuleRow =
  | { source: 'card'; originalMerchantName: string; /** הערות */ notes?: string | null }
  | {
      source: 'bank'
      originalDescription: string
      /** הערה */
      note?: string | null
      description: string
      debit: number
      credit: number
      /** Its description is on the generic list (lib/db/generic-descriptions.ts) */
      generic: boolean
    }

/** The kind of category a row takes, or null when it never takes one from a rule */
export function ruleKindOf(row: RuleRow): CategoryKindName | null {
  if (row.source === 'card') return 'EXPENSE'
  if (row.generic || isCardPaymentRow(row)) return null
  return CATEGORY_KIND_OF[directionOf(row)]
}

/** The merchant or description as the file has it */
export const ruleMainTextOf = (row: RuleRow) => (row.source === 'card' ? row.originalMerchantName : row.originalDescription)

/** The row's notes ('' when none) */
export const ruleNotesOf = (row: RuleRow) => (row.source === 'card' ? row.notes : row.note) ?? ''

/**
 * The text a rule is matched against: the merchant or description, then the notes. The
 * separator is no letter or space, so a pattern never matches across the two.
 */
export const ruleTextOf = (row: RuleRow) => {
  const notes = ruleNotesOf(row)
  return notes ? `${ruleMainTextOf(row)}\u0000${notes}` : ruleMainTextOf(row)
}

/** Where a rule's text is found on a row (both false when its merchant limit leaves the row out) */
export function ruleMatch(rule: Pick<KeywordRule, 'pattern' | 'scope' | 'merchant'>, row: RuleRow): { name: boolean; notes: boolean } {
  const main = ruleMainTextOf(row)
  if (rule.merchant && folded(rule.merchant) !== folded(main)) return { name: false, notes: false }
  const scope = rule.scope ?? 'ANY'
  const notes = ruleNotesOf(row)
  return {
    name: scope !== 'NOTES' && keywordMatches(rule.pattern, main),
    notes: scope !== 'NAME' && !!notes && keywordMatches(rule.pattern, notes),
  }
}

/** Whether the rule reaches the row at all */
export const ruleReaches = (rule: Pick<KeywordRule, 'pattern' | 'scope' | 'merchant'>, row: RuleRow) => {
  const m = ruleMatch(rule, row)
  return m.name || m.notes
}

/** Whether the rule, when it reaches the row, wins over the row's exact rule (steps 2 and 3) */
export const ruleBeatsExact = (rule: Pick<KeywordRule, 'pattern' | 'scope' | 'merchant'>, row: RuleRow) => {
  const m = ruleMatch(rule, row)
  return rule.merchant ? m.name || m.notes : m.notes
}

/** The longest pattern among the rules, then the oldest */
function longest<R extends KeywordRule>(rules: R[]): R | null {
  let best: R | null = null
  for (const r of rules) {
    if (
      !best ||
      r.pattern.length > best.pattern.length ||
      (r.pattern.length === best.pattern.length && r.createdAt.getTime() < best.createdAt.getTime())
    ) {
      best = r
    }
  }
  return best
}

/** The contains rule that wins over the row's exact rule (steps 2 and 3), or null */
export function ruleOverExact<R extends KeywordRule>(row: RuleRow, rules: R[]): R | null {
  const kind = ruleKindOf(row)
  if (!kind) return null
  const ofKind = rules.filter(r => r.kind === kind)
  return (
    longest(ofKind.filter(r => r.merchant && ruleReaches(r, row))) ??
    longest(ofKind.filter(r => !r.merchant && ruleMatch(r, row).notes))
  )
}

/**
 * The category the rules give a row that nobody categorised by hand, in the order at
 * the top: a merchant-limited rule, a notes match, the exact rule (`exact`, null when
 * it has none), a name match, else null.
 */
export function resolveRuleCategory(row: RuleRow, exact: string | null, rules: KeywordRule[]): string | null {
  const kind = ruleKindOf(row)
  if (!kind) return null
  const over = ruleOverExact(row, rules)
  if (over) return over.category
  if (exact) return exact
  return longest(rules.filter(r => r.kind === kind && !r.merchant && ruleMatch(r, row).name))?.category ?? null
}

/**
 * A suggested pattern for a row's text: its first word of at least three letters
 * ("ACME" in "ACME MUSIC P12345 TESTVILLE"), else the whole text.
 */
export function suggestKeyword(text: string): string {
  const word = normalizeKeyword(text)
    .split(' ')
    .find(w => (w.match(/\p{L}/gu)?.length ?? 0) >= 3 && /^[\p{L}'"׳״.&-]+$/u.test(w))
  return word ?? normalizeKeyword(text)
}
