import { averageStat, StatGrid, StatTile, type StatDef } from '@/components/dashboard/summary-cards'

interface Props {
  total: number
  count: number
  /** Yearly monthly average (of the filtered category, when there is one) */
  average: number
  /** The selected month's name: its total is compared with the average */
  monthLabel?: string
}

function cardStats({ total, count, average, monthLabel }: Pick<Props, 'total' | 'count' | 'average' | 'monthLabel'>): StatDef[] {
  return [
    { label: 'מספר עסקאות', value: count, tone: 'neutral', format: 'integer' },
    averageStat(
      { label: 'ממוצע חודשי', tone: 'cc', format: 'currencyExact' },
      average,
      monthLabel ? { label: monthLabel, value: total } : undefined
    ),
  ]
}

/**
 * A card's page (ENG-56): the total sits on the card itself, so only the
 * count and the monthly average remain, as tiles beside it.
 */
export function CardStatTiles(props: Pick<Props, 'total' | 'count' | 'average' | 'monthLabel'>) {
  return <StatGrid stats={cardStats(props)} />
}

/**
 * /cards: the total across the cards is on the wallet's leather pocket (with
 * the "paid from the bank" caption under it), so only the count and the
 * monthly average remain. A pair on phones; on wide screens they follow the
 * wallet shell's columns (count under the wallet, average under the list),
 * so the row lines up with the stack and the list above it.
 */
export function CardSummaryCards(props: Pick<Props, 'total' | 'count' | 'average' | 'monthLabel'>) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
      {cardStats(props).map(s => (
        <StatTile key={s.label} {...s} />
      ))}
    </div>
  )
}
