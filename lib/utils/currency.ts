export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatCurrencyWhole(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 2 }).format(amount)
}

/**
 * A net in whole shekels with its sign, for a left-to-right run (<bdi dir="ltr">):
 * "+5,522 ₪" / "−410 ₪" (a true minus) / "0 ₪". The Hebrew format's direction marks
 * are dropped, or they pull the sign away from the number.
 */
export function formatNet(amount: number): string {
  const rounded = Math.round(amount)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${formatCurrencyWhole(Math.abs(rounded)).replace(/[\u200e\u200f]/g, '')}`
}
