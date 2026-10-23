import { averageStat, StatGrid, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  total: number
  count: number
  /** Yearly monthly average (of the filtered category, when there is one) */
  average: number
  /** The selected month's name: its total is compared with the average */
  monthLabel?: string
  /** Whether the selected month has any charges; without, the average gets no comparison chip */
  monthHasData?: boolean
}

function cardStats({ total, count, average, monthLabel, monthHasData = true }: Pick<Props, 'total' | 'count' | 'average' | 'monthLabel' | 'monthHasData'>): StatDef[] {
  return [
    { label: 'מספר עסקאות', value: count, tone: 'neutral', format: 'integer' },
    averageStat(
      { label: 'ממוצע חודשי', tone: 'cc', format: 'currencyExact' },
      average,
      monthLabel ? { label: monthLabel, value: total, hasData: monthHasData } : undefined
    ),
  ]
}

/**
 * The count and the monthly average, beside the wallet: on a card's page (the
 * total sits on the card) and on /cards under the card list (the total is on
 * the pocket). `className` sizes the pair (flex-1 fills the wallet's height).
 */
export function CardStatTiles({
  className,
  ...props
}: Pick<Props, 'total' | 'count' | 'average' | 'monthLabel' | 'monthHasData'> & { className?: string }) {
  return <StatGrid className={className} stats={cardStats(props)} />
}
