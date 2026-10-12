'use client'

import { useSearchParams } from 'next/navigation'

export function usePeriod() {
  const params = useSearchParams()
  const now = new Date()
  const year = Number(params.get('year') ?? now.getFullYear())
  const month = Number(params.get('month') ?? now.getMonth() + 1)
  return { year, month }
}
