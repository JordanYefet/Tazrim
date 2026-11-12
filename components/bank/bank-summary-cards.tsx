import { averageStat, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  income: number
  expense: number
  /** Yearly average expense, bank only */
  averageExpense: number
  /** Yearly average income */
  averageIncome: number
  /** The selected month's name: its expense is compared with the average */
  monthLabel?: string
  /** Whether the selected month has any data; without, the average gets no comparison chip */
  monthHasData?: boolean
  /** The selected month is this month: its figures are partial, so no comparison chip */
  monthInProgress?: boolean
}

/** The four tiles: totals in the first row, monthly averages under them (income column, expense column). */
export function bankStats({ income, expense, averageExpense, averageIncome, monthLabel, monthHasData = true, monthInProgress = false }: Props): StatDef[] {
  const compared = (value: number) => (monthLabel ? { label: monthLabel, value, hasData: monthHasData, inProgress: monthInProgress } : undefined)
  return [
    { label: 'סה״כ הכנסות', value: income, tone: 'income', format: 'currency' },
    { label: 'סה״כ הוצאות', value: expense, tone: 'expense', format: 'currency', hint: 'כולל חיובי כרטיס' },
    averageStat({ label: 'ממוצע הכנסות חודשי', tone: 'neutral', format: 'currency' }, averageIncome, compared(income), { upIsGood: true }),
    averageStat({ label: 'ממוצע הוצאות חודשי', tone: 'neutral', format: 'currency' }, averageExpense, compared(expense)),
  ]
}
