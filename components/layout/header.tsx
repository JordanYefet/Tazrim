'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ThemeSelector } from './theme-selector'

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const now = new Date()
  const year = Number(params.get('year') ?? now.getFullYear())
  const month = params.get('month') ?? ''

  function update(key: string, value: string) {
    const sp = new URLSearchParams(params.toString())
    if (value === '') {
      sp.delete(key)
    } else {
      sp.set(key, value)
    }
    router.push(`${pathname}?${sp.toString()}`)
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b bg-card gap-4 h-14">
      <div className="flex items-center gap-2">
        <select
          value={month}
          onChange={e => update('month', e.target.value)}
        >
          <option value="">כל החודשים</option>
          {MONTHS.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => update('year', e.target.value)}
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <ThemeSelector />
    </header>
  )
}
