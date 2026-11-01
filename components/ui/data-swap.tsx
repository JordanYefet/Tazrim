'use client'

import { useRef, type ElementType, type ReactNode } from 'react'
import { useDataSwap, type DataSwapKey, type DataSwapOptions } from '@/hooks/use-data-swap'

/**
 * useDataSwap for server components and for blocks a page remounts with
 * `key=` (the transaction tables): this wrapper stays mounted, so it sees the
 * key change that the remounted child cannot. Marks inside with `data-swap`
 * fade alone (the table and not its toolbar); without any, the whole block does.
 */
export function DataSwap({
  swapKey,
  height,
  as: Tag = 'div',
  className,
  children,
}: {
  /** What decides the rows: filters, the period, the page. A change plays the swap */
  swapKey: DataSwapKey
  /** Ease the height between row counts too */
  height?: DataSwapOptions['height']
  as?: ElementType
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  useDataSwap(ref, swapKey, { height, targets: SWAP_TARGETS })
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

/** The attribute a child puts on the part that should fade (see DataSwap) */
export const SWAP_TARGETS = '[data-swap]'
