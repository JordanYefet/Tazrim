'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { SegmentedTrack } from './segmented'

/**
 * Two (or more) equal tabs with a thumb that slides between them: the
 * הוצאות / הכנסות switch on /categories, also בנק / כרטיס אשראי when adding
 * an account.
 */
export function SegmentedTabs<K extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: K
  onChange: (k: K) => void
  options: { key: K; label: ReactNode }[]
  ariaLabel: string
}) {
  return (
    <SegmentedTrack
      role="tablist"
      aria-label={ariaLabel}
      active={value}
      thumbClassName="rounded-[9px] bg-card shadow-sm"
      className="grid auto-cols-fr grid-flow-col rounded-xl bg-muted p-[3px]"
    >
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="tab"
          data-segment={o.key}
          data-on={value === o.key || undefined}
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'flex h-9 items-center justify-center gap-2 rounded-[9px] text-[15px] transition-colors duration-base',
            value === o.key ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </SegmentedTrack>
  )
}
