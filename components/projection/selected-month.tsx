'use client'

import { createContext, useContext, useState } from 'react'

/** The forecast month picked on the chart (YYYY-MM), or null for a typical month */
const SelectedMonth = createContext<{ month: string | null; select: (month: string | null) => void }>({
  month: null,
  select: () => {},
})

export function SelectedMonthProvider({ children }: { children: React.ReactNode }) {
  const [month, select] = useState<string | null>(null)
  return <SelectedMonth.Provider value={{ month, select }}>{children}</SelectedMonth.Provider>
}

export function useSelectedMonth() {
  return useContext(SelectedMonth)
}
