import { averageStat, NetBalance, StatGrid, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  income: number
  expense: number
  /** Yearly average expense, bank only */
  averageExpense: number
  /** The selected month's name: its expense is compared with the average */
  monthLabel?: string
  /** Whether the selected month has any data; without, the average gets no comparison chip */
  monthHasData?: boolean
}

/**
 * Hero net balance plus quieter tiles, as on the dashboard. Bank expenses
 * already include the card payment, so nothing is added for card charges.
 */
export function BankSummaryCards({ income, expense, averageExpense, monthLabel, monthHasData = true }: Props) {
  const stats: StatDef[] = [
    { label: 'סה״כ הכנסות', value: income, tone: 'income', format: 'currencyExact' },
    { label: 'סה״כ הוצאות', value: expense, tone: 'expense', format: 'currencyExact', hint: 'כולל חיובי כרטיס' },
    averageStat(
      { label: 'ממוצע הוצאות חודשי', tone: 'neutral', format: 'currencyExact' },
      averageExpense,
      monthLabel ? { label: monthLabel, value: expense, hasData: monthHasData } : undefined
    ),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <NetBalance bankIncome={income} bankExpense={expense} format="currencyExact" />
      <StatGrid stats={stats} />
    </div>
  )
}
