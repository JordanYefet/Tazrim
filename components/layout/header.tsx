'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils/cn'

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
          'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
        )}
        aria-label="החלף ערכת נושא"
      >
        {mounted && (theme === 'dark'
          ? <Sun className="h-4 w-4" />
          : <Moon className="h-4 w-4" />
        )}
      </button>
    </header>
  )
}
