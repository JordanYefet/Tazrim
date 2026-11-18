import { describe, expect, it } from 'vitest'
import { describeSeries, describeShares, pointsOf } from '../chart-summary'

const fmt = (n: number) => `${n} ₪`

describe('describeSeries', () => {
  it('names the range, the extremes and the latest value', () => {
    const text = describeSeries('הוצאות', [
      { label: 'ינואר', value: 100 },
      { label: 'פברואר', value: 50 },
      { label: 'מרץ', value: 300 },
      { label: 'אפריל', value: 120 },
    ], fmt)
    expect(text).toBe('הוצאות: מינואר עד אפריל, הגבוה ביותר במרץ (300 ₪), הנמוך ביותר בפברואר (50 ₪), האחרון 120 ₪')
  })

  it('skips empty months', () => {
    const text = describeSeries('הכנסות', [{ label: 'ינואר', value: null }, { label: 'פברואר', value: 10 }, { label: 'מרץ', value: undefined }], fmt)
    expect(text).toBe('הכנסות: פברואר, 10 ₪')
  })

  it('says so when there is nothing', () => {
    expect(describeSeries('יתרה', [{ label: 'ינואר', value: null }], fmt)).toBe('יתרה: אין נתונים')
    expect(describeSeries('יתרה', [], fmt)).toBe('יתרה: אין נתונים')
  })
})

describe('describeShares', () => {
  it('lists the largest parts with their share, and counts the rest', () => {
    const items = [
      { name: 'א', value: 50 },
      { name: 'ב', value: 30 },
      { name: 'ג', value: 20 },
      { name: 'ד', value: 0 },
    ]
    expect(describeShares(items, fmt, 2)).toBe('א 50 ₪ (50%), ב 30 ₪ (30%) ועוד 1')
  })

  it('has a word for no data', () => {
    expect(describeShares([], fmt)).toBe('אין נתונים')
  })
})

describe('pointsOf', () => {
  it('reads one key of the rows, labelled by name', () => {
    expect(pointsOf([{ name: 'ינואר', x: 1 }, { name: 'פברואר', x: 2 }], 'x')).toEqual([
      { label: 'ינואר', value: 1 },
      { label: 'פברואר', value: 2 },
    ])
  })
})
