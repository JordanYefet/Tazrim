'use client'

import Link from 'next/link'
import { SegmentedTrack } from '@/components/ui/segmented'

/** All banks, or one: the segmented control the app uses for small choices */
export function BankPicker({ banks, active }: { banks: { id: string; displayName: string }[]; active: string | null }) {
  const options = [{ key: 'all', label: 'כל הבנקים', href: '/projection' }, ...banks.map(b => ({ key: b.id, label: b.displayName, href: `/projection?account=${b.id}` }))]
  const current = active ?? 'all'
  return (
    <SegmentedTrack
      as="nav"
      aria-label="בחירת בנק"
      data-bank-picker
      active={current}
      thumbClassName="rounded-md bg-card shadow-e1"
      className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted p-0.5"
    >
      {options.map(o => (
        <Link
          key={o.key}
          href={o.href}
          data-segment={o.key}
          data-on={o.key === current || undefined}
          aria-current={o.key === current ? 'page' : undefined}
          className="relative whitespace-nowrap rounded-md px-3 py-1 text-sm"
        >
          {o.label}
        </Link>
      ))}
    </SegmentedTrack>
  )
}
