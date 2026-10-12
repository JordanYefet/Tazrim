import { RollingNumber } from '@/components/ui/rolling-number'
import { cn } from '@/lib/utils/cn'

interface Props {
  income: number
  expense: number
  averageExpense?: number
}

function SummaryCard({ label, value, variant }: { label: string; value: number; variant: 'income' | 'expense' | 'cc' | 'neutral' }) {
  const borderColor = {
    income: 'border-t-[hsl(var(--income))]',
    expense: 'border-t-[hsl(var(--expense))]',
    cc: 'border-t-[hsl(var(--cc))]',
    neutral: 'border-t-primary',
  }[variant]

  const valueColor = {
    income: 'text-[hsl(var(--income))]',
    expense: 'text-[hsl(var(--expense))]',
    cc: 'text-[hsl(var(--cc))]',
    neutral: 'text-foreground',
  }[variant]

  return (
    <div className={cn('rounded-lg border bg-card p-4 border-t-[3px]', borderColor)}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', valueColor)}>
        <RollingNumber value={value} format="currencyExact" />
      </p>
    </div>
  )
}

export function BankSummaryCards({ income, expense, averageExpense }: Props) {
  const net = income - expense
  return (
    <div className={cn(
      'grid gap-3',
      averageExpense !== undefined ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
    )}>
      <SummaryCard label="סה״כ הכנסות" value={income} variant="income" />
      <SummaryCard label="סה״כ הוצאות" value={expense} variant="expense" />
      <SummaryCard label="מאזן נטו" value={net} variant={net >= 0 ? 'income' : 'expense'} />
      {averageExpense !== undefined && (
        <SummaryCard label="ממוצע הוצאות חודשי" value={averageExpense} variant="cc" />
      )}
    </div>
  )
}
