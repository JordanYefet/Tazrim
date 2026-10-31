/**
 * Contains-text category rules (CategoryKeywordRule): "every transaction whose text
 * contains ACME MUSIC is שירותי תקשורת", for charges whose merchant name carries a new id
 * each time, so no exact rule can catch them all.
 *
 * Which category a rule gives a row, in order:
 *   1. a category picked on the row by hand (the callers skip those rows)
 *   2. the exact rule: a merchant rule (cards) or a description rule (bank)
 *   3. the longest contains rule that matches; on a tie, the oldest
 *   4. none: the issuer's category on a card, uncategorised on the bank
 *
 * A rule's category kind decides its rows: an expense one covers card charges and
 * bank debits, an income one bank credits. The bank's card payments and generic
 * descriptions (cheques, transfers) never take one.
 */
import { CATEGORY_KIND_OF, directionOf, isCardPaymentRow } from './bank-categories'

export type CategoryKindName = 'EXPENSE' | 'INCOME'

export interface KeywordRule {
  /** Stored normalised (normalizeKeyword) */
  pattern: string
  category: string
  /** The kind of `category`; a rule whose category no longer exists is left out by the loader */
  kind: CategoryKindName
  createdAt: Date
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
  | { source: 'card'; originalMerchantName: string }
  | {
      source: 'bank'
      originalDescription: string
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

/** The text a rule is matched against: the merchant or description as the file has it */
export const ruleTextOf = (row: RuleRow) => (row.source === 'card' ? row.originalMerchantName : row.originalDescription)

/**
 * The category the rules give a row that nobody categorised by hand: its exact rule's
 * (`exact`, null when it has none), else the winning contains rule's, else null.
 */
export function resolveRuleCategory(row: RuleRow, exact: string | null, rules: KeywordRule[]): string | null {
  const kind = ruleKindOf(row)
  if (!kind) return null
  if (exact) return exact
  return keywordRuleFor(ruleTextOf(row), rules, kind)?.category ?? null
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
