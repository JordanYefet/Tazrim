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
}

/** The four tiles: totals in the first row, monthly averages under them (income column, expense column). */
export function bankStats({ income, expense, averageExpense, averageIncome, monthLabel, monthHasData = true }: Props): StatDef[] {
  return [
    { label: 'סה״כ הכנסות', value: income, tone: 'income', format: 'currencyExact' },
    { label: 'סה״כ הוצאות', value: expense, tone: 'expense', format: 'currencyExact', hint: 'כולל חיובי כרטיס' },
    averageStat(
      { label: 'ממוצע הכנסות חודשי', tone: 'neutral', format: 'currencyExact' },
      averageIncome,
      monthLabel ? { label: monthLabel, value: income, hasData: monthHasData } : undefined,
      { upIsGood: true }
    ),
    averageStat(
      { label: 'ממוצע הוצאות חודשי', tone: 'neutral', format: 'currencyExact' },
      averageExpense,
      monthLabel ? { label: monthLabel, value: expense, hasData: monthHasData } : undefined
    ),
  ]
}
