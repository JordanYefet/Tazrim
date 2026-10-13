import { NetBalance, StatGrid, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  income: number
  expense: number
  averageExpense?: number
}

/**
 * Hero net balance plus quieter tiles, as on the dashboard. Bank expenses
 * already include the card payment, so nothing is added for card charges.
 */
export function BankSummaryCards({ income, expense, averageExpense }: Props) {
  const stats: StatDef[] = [
    { label: 'סה״כ הכנסות', value: income, tone: 'income', format: 'currencyExact' },
    { label: 'סה״כ הוצאות', value: expense, tone: 'expense', format: 'currencyExact', hint: 'כולל חיובי כרטיס' },
    ...(averageExpense !== undefined
      ? [{ label: 'ממוצע הוצאות חודשי', value: averageExpense, tone: 'neutral' as const, format: 'currencyExact' as const }]
      : []),
  ]

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <NetBalance bankIncome={income} bankExpense={expense} format="currencyExact" />
      <StatGrid stats={stats} />
    </div>
  )
}
