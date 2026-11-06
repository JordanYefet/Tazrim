/**
 * One-time data updates a release needs on rows already stored, run once when the
 * server starts (instrumentation.ts) and remembered in Setting so they never run again.
 */
import { prisma, type Db } from './client'
import { keywordMatches } from '../insights/keyword-rules'
import { recomputeRuleCategories } from './keyword-rules'

/**
 * ENG-101: contains-text rules now match the notes too, and a notes match beats the
 * merchant / description rule. Rows stored before only follow that once a rule is
 * saved again, so every row a rule's text reaches is recomputed once.
 */
export const NOTES_RULES_BACKFILL = 'backfill.keyword-rules-notes'

export async function runBackfills(db: Db = prisma): Promise<{ ran: boolean; changed: number }> {
  if (await db.setting.findUnique({ where: { key: NOTES_RULES_BACKFILL } })) return { ran: false, changed: 0 }
  const patterns = (await db.categoryKeywordRule.findMany({ select: { pattern: true } })).map(r => r.pattern)
  let changed = 0
  if (patterns.length) {
    const res = await recomputeRuleCategories(db, text => patterns.some(p => keywordMatches(p, text)))
    changed = res.cardIds.length + res.bankIds.length
  }
  await db.setting.create({ data: { key: NOTES_RULES_BACKFILL, value: new Date().toISOString() } })
  return { ran: true, changed }
}
