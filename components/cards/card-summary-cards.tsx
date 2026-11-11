import { averageStat, StatGrid, type StatDef } from '@/components/dashboard/summary-cards'
import { MonthBarsChart } from '@/components/cards/month-bars'
import { formatCurrencyWhole } from '@/lib/utils/currency'

interface Props {
  total: number
  /** Yearly monthly average (of the filtered category, when there is one) */
  average: number
  /** The selected month's name: its total is compared with the average */
  monthLabel?: string
  /** Whether the selected month has any charges; without, the average gets no comparison chip */
  monthHasData?: boolean
  /** Billing month (1-12) -> total charged (getCCMonthlySummary): a mini chart with the average line in the average tile */
  monthlyTotals?: Record<number, number>
  /** The selected month (?month=), highlighted on the charts; without one the latest month with data is */
  selectedMonth?: number
}

function cardStats({
  total,
  average,
  monthLabel,
  monthHasData = true,
  monthlyTotals,
  selectedMonth,
}: Props): StatDef[] {
  return [
    {
      ...averageStat(
        { label: 'ממוצע חודשי', tone: 'cc', format: 'currency' },
        average,
        monthLabel ? { label: monthLabel, value: total, hasData: monthHasData } : undefined
      ),
      footer: monthlyTotals && (
        <MonthBarsChart
          values={monthlyTotals}
          selectedMonth={selectedMonth}
          average={average}
          tone="cc"
          caption="החיובים בכל חודש מול הממוצע"
          formatValue={formatCurrencyWhole}
        />
      ),
    },
  ]
}

/**
 * The monthly average (one full-width tile), beside the wallet: on a card's page (the
 * total sits on the card) and on /cards under the card list (the total is on
 * the pocket). `className` sizes the pair (flex-1 fills the wallet's height);
 * with monthly data, each tile fills that height with a small chart by month.
 */
export function CardStatTiles({ className, ...props }: Props & { className?: string }) {
  return <StatGrid className={className} stats={cardStats(props)} />
}
