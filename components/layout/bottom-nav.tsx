'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Building2, CreditCard, Upload, Tag, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const NAV_ITEMS = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/bank', label: 'בנק', icon: Building2 },
  { href: '/cards/max', label: 'מקס', icon: CreditCard },
  { href: '/recurring', label: 'קבועים', icon: Repeat },
  { href: '/upload', label: 'העלאה', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t bg-card flex px-2 pb-[env(safe-area-inset-bottom)]">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 flex-1 py-2 text-xs transition-colors relative',
              active
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 bg-primary rounded-full" />
            )}
            <span
              className={cn(
                'flex items-center justify-center h-7 w-12 rounded-lg transition-colors',
                active ? 'bg-primary/10' : 'hover:bg-muted'
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
