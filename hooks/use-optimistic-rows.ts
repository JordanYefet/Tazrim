'use client'

import { useOptimistic } from 'react'
import { applyChange, type RowChange } from '@/lib/tables/category-change'

/**
 * A table's rows with the changes the server hasn't answered yet. `rows` is the
 * state the table keeps; `show(change)`, called inside the transition that runs the
 * save (`startTransition(async () => { show(...); await fetch(...) })`), patches the
 * rows on screen at once. When that transition ends the patch is dropped: by then the
 * table has set the rows itself (the save landed) or it hasn't (the save failed, and
 * the rows go back to what they were). Several saves in flight stack.
 */
export function useOptimisticRows<T>(rows: T[]): [T[], (change: RowChange<T>) => void] {
  return useOptimistic(rows, (current: T[], change: RowChange<T>) => applyChange(current, change))
}
