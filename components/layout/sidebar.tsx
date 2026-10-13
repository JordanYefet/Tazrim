'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload, Tag, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק לאומי', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/recurring', label: 'חיובים קבועים', icon: Repeat },
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-56 flex-col border-e bg-card">
      {/* Logo */}
      <div className="px-5 border-b h-14 flex items-center">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground text-sm font-bold">ת</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight">תזרים</h1>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative',
                active
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {active && (
                <span className="absolute end-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
