import { Copy, Zap } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { UnusualFlag } from '@/lib/insights/unusual'
import { unusualFlagDetail, unusualFlagLabel } from './unusual-copy'

interface Props {
  flag: UnusualFlag
  className?: string
}

/** Small pill for a transaction row; the full explanation is in the tooltip */
export function UnusualBadge({ flag, className }: Props) {
  const duplicate = flag.reason === 'possible_duplicate'
  const Icon = duplicate ? Copy : Zap
  return (
    <span
      title={unusualFlagDetail(flag)}
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium',
        duplicate
          ? 'bg-[hsl(var(--cc)/0.14)] text-[hsl(var(--cc))]'
          : 'bg-[hsl(var(--expense)/0.12)] text-[hsl(var(--expense))]',
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {unusualFlagLabel(flag)}
    </span>
  )
}
