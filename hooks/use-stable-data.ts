'use client'

import { useRef } from 'react'

/**
 * Keeps the same reference while the value's contents are unchanged.
 * Recharts remounts every bar when it gets a new `data` array, which cuts
 * off CSS transitions (the month-selection fade). Picking a month rebuilds
 * the chart rows with identical values, so this hands Recharts the old array.
 */
export function useStableData<T>(value: T): T {
  const ref = useRef<{ json: string; value: T } | null>(null)
  const json = JSON.stringify(value)
  if (ref.current?.json !== json) ref.current = { json, value }
  return ref.current.value
}
