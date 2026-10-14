'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Building2, ChevronLeft, CreditCard, Ellipsis, LayoutDashboard, Repeat, Settings, Tag, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isNavActive } from '@/lib/accounts/routes'
import { isMoreActive } from '@/lib/nav/state'

const TABS: { href: string; label: string; title?: string; icon: typeof LayoutDashboard }[] = [
  { href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/banks', label: 'בנקים', icon: Building2 },
  { href: '/cards', label: 'כרטיסים', title: 'כרטיסי אשראי', icon: CreditCard },
  { href: '/recurring', label: 'קבועים', title: 'חיובים קבועים', icon: Repeat },
]

const MORE_LINKS = [
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
  { href: '/settings', label: 'הגדרות', hint: 'ערכת נושא · ניהול חשבונות', icon: Settings },
]

const TAB =
  'relative flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-xs whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

function TabBody({ active, icon: Icon, label }: { active: boolean; icon: typeof LayoutDashboard; label: string }) {
  return (
    <>
      {active && <span aria-hidden className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />}
      <span
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-primary/10' : 'group-hover:bg-muted'
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      {label}
    </>
  )
}

/**
 * Phone tab bar: four sections plus "עוד", a bottom sheet with the rest.
 * Fixed to the bottom, translucent, and padded for the home indicator.
 */
export function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  // A link in the sheet navigates; close it once the page changes
  useEffect(() => setMoreOpen(false), [pathname])

  const moreActive = moreOpen || isMoreActive(pathname)

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden [@media(prefers-reduced-transparency:reduce)]:bg-card"
    >
      {TABS.map(({ href, label, title, icon }) => {
        const active = !moreOpen && isNavActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-label={title}
            aria-current={isNavActive(pathname, href) ? 'page' : undefined}
            className={cn(TAB, 'group', active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground')}
          >
            <TabBody active={active} icon={icon} label={label} />
          </Link>
        )
      })}

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Trigger
          className={cn(TAB, 'group', moreActive ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground')}
          aria-label="עוד: העלאת קבצים, קטגוריות, הגדרות"
        >
          <TabBody active={moreActive} icon={Ellipsis} label="עוד" />
        </Dialog.Trigger>
        <Dialog.Portal>
          {/* The scrim stops above the tab bar, so "עוד" stays visible (and tappable to close) */}
          <Dialog.Overlay className="sheet-scrim fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 bg-black/45 md:hidden" />
          <Dialog.Content
            dir="rtl"
            aria-describedby={undefined}
            className="sheet fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_-12px_40px_rgba(0,0,0,0.35)] focus:outline-none md:hidden"
          >
            <Dialog.Title className="sr-only">עוד</Dialog.Title>
            <div aria-hidden className="flex justify-center pt-2">
              <span className="h-1 w-9 rounded-full bg-border" />
            </div>
            <ul className="pb-1">
              {MORE_LINKS.map(({ href, label, hint, icon: Icon }, i) => {
                const active = isNavActive(pathname, href)
                return (
                  <li key={href}>
                    {i > 0 && <div aria-hidden className="ms-[3.25rem] h-px bg-border" />}
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex min-h-12 items-center gap-3.5 px-4 py-3.5 text-[15px] transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        active && 'text-primary'
                      )}
                    >
                      <Icon className={cn('h-5 w-5 shrink-0', !active && 'text-muted-foreground')} aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn(active && 'font-medium')}>{label}</span>
                        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </nav>
  )
}
