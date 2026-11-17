import { describe, expect, it } from 'vitest'
import { splitAmounts } from '../money-text'
import { formatCurrency, formatCurrencyWhole, formatNet } from '@/lib/utils/currency'

const money = (text: string) => splitAmounts(text).filter(p => p.money).map(p => p.text)

describe('splitAmounts', () => {
  it('finds amounts as the currency helpers write them', () => {
    expect(money(`ממוצע חודשי ${formatCurrencyWhole(21287)}`)).toEqual([formatCurrencyWhole(21287)])
    expect(money(`כמו ${formatCurrency(-120.5)} ב־12/10`)).toEqual([formatCurrency(-120.5)])
    expect(money(`נטו ${formatNet(-410)}`)).toEqual([formatNet(-410)])
    expect(money(`נטו ${formatNet(5522)}`)).toEqual([formatNet(5522)])
  })

  it('finds several amounts and keeps the words around them', () => {
    const text = `3 פעילים · ${formatCurrencyWhole(1200)} בשנה, עד ${formatCurrencyWhole(80)}`
    const parts = splitAmounts(text)
    expect(parts.map(p => p.text).join('')).toBe(text)
    expect(parts.filter(p => p.money)).toHaveLength(2)
  })

  it('finds a hand-written ₪120', () => {
    expect(money('הפרש ₪120 מהקובץ')).toEqual(['₪120'])
  })

  it("finds a card row's foreign amount", () => {
    expect(money('סכום עסקה 12.5 USD · אסמכתא 778812')).toEqual(['12.5 USD'])
    expect(money('$12.50')).toEqual(['$12.50'])
    expect(money('9.99 €')).toEqual(['9.99 €'])
  })

  it('leaves counts, dates and percentages alone', () => {
    expect(money('3 כרטיסים · 12/10/2026 · 14% מעל הממוצע')).toEqual([])
  })
})
