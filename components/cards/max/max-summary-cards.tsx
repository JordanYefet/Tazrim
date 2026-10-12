import { RollingNumber } from '@/components/ui/rolling-number'
import { cn } from '@/lib/utils/cn'

interface Props {
  total: number
  count: number
  average?: number
}

function SummaryCard({ label, value, variant, isCount }: {
  label: string; value: number; variant: 'expense' | 'cc' | 'neutral'; isCount?: boolean
}) {
  const borderColor = {
    expense: 'border-t-[hsl(var(--expense))]',
    cc: 'border-t-[hsl(var(--cc))]',
    neutral: 'border-t-primary',
  }[variant]

  const valueColor = {
    expense: 'text-[hsl(var(--expense))]',
    cc: 'text-[hsl(var(--cc))]',
    neutral: 'text-foreground',
  }[variant]

  return (
    <div className={cn('rounded-lg border bg-card p-4 border-t-[3px]', borderColor)}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1.5">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', valueColor)}>
        <RollingNumber value={value} format={isCount ? 'integer' : 'currencyExact'} />
      </p>
    </div>
  )
}

export function MaxSummaryCards({ total, count, average }: Props) {
  return (
    <div className={cn('grid gap-3', average !== undefined ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
      <SummaryCard label="סה״כ חיובים" value={total} variant="expense" />
      <SummaryCard label="מספר עסקאות" value={count} variant="neutral" isCount />
      {average !== undefined && (
        <SummaryCard label="ממוצע חודשי" value={average} variant="cc" />
      )}
    </div>
  )
}
