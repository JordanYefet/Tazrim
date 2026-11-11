import { describe, expect, it } from 'vitest'
import { groupCategoryBars, OTHER_KEY } from '../category-bars'

const ranked = ['מזון', 'דלק', 'בילויים', 'ביגוד', 'בריאות', 'ביטוח', 'מתנות', 'חיות', 'ללא קטגוריה']

describe('groupCategoryBars', () => {
  it('keeps the top six of the year and folds the rest into אחר with their count', () => {
    const { rows } = groupCategoryBars(ranked, { מזון: 100, מתנות: 20, חיות: 5, 'ללא קטגוריה': 7 })
    expect(rows.map(r => r.key)).toEqual([...ranked.slice(0, 6), OTHER_KEY])
    const other = rows[6]
    expect(other.label).toBe('אחר (3)')
    expect(other.members).toEqual(['מתנות', 'חיות', 'ללא קטגוריה'])
    expect(other.amount).toBe(32)
  })

  it('keeps the order and the rows when the period changes; only amounts differ', () => {
    const a = groupCategoryBars(ranked, { מזון: 10, ביטוח: 50, חיות: 3 })
    const b = groupCategoryBars(ranked, { דלק: 80 })
    expect(a.rows.map(r => r.key)).toEqual(b.rows.map(r => r.key))
    expect(a.rows.map(r => r.label)).toEqual(b.rows.map(r => r.label))
    expect(b.rows.find(r => r.key === 'מזון')?.amount).toBe(0)
  })

  it('keeps a category with nothing this period as a row at 0', () => {
    const { rows, total, max } = groupCategoryBars(ranked, {})
    expect(rows).toHaveLength(7)
    expect(total).toBe(0)
    expect(max).toBe(0)
  })

  it('has no אחר row when there are six categories or fewer', () => {
    const { rows } = groupCategoryBars(ranked.slice(0, 4), { מזון: 1 })
    expect(rows.map(r => r.key)).toEqual(ranked.slice(0, 4))
  })

  it('puts a category unknown to the ranking last, inside אחר once past the limit', () => {
    const { rows } = groupCategoryBars(['א', 'ב'], { ג: 4 }, 2)
    expect(rows.map(r => r.key)).toEqual(['א', 'ב', OTHER_KEY])
    expect(rows[2].amount).toBe(4)
  })

  it('reports the total and the largest row (אחר counts as one row)', () => {
    const { total, max } = groupCategoryBars(ranked, { מזון: 40, חיות: 30, מתנות: 25 })
    expect(total).toBe(95)
    expect(max).toBe(55)
  })
})
