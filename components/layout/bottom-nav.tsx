'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Building2, ChevronLeft, CreditCard, Ellipsis, House, Info, LayoutDashboard, Repeat, Settings, Tag, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isNavActive } from '@/lib/accounts/routes'
import { isMoreActive } from '@/lib/nav/state'
import { usePeriodHref } from './period-context'

// Home sits in the middle slot (of five, with "עוד" last), like most phone apps
const TABS: { href: string; label: string; title?: string; icon: typeof LayoutDashboard }[] = [
  { href: '/banks', label: 'בנקים', icon: Building2 },
  { href: '/cards', label: 'כרטיסים', title: 'כרטיסי אשראי', icon: CreditCard },
  { href: '/', label: 'לוח בקרה', icon: House },
  { href: '/recurring', label: 'קבועים', title: 'חיובים קבועים', icon: Repeat },
]

const MORE_LINKS = [
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
  { href: '/settings', label: 'הגדרות', hint: 'ערכת נושא · ניהול חשבונות', icon: Settings },
  { href: '/about', label: 'אודות', hint: 'הסיפור, פרטיות ויצירת קשר', icon: Info },
]

// Each tab is a 1/5 slot of the pill; the active highlight slides between slots
const TAB =
  'group relative z-10 flex h-full min-w-0 flex-1 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

function TabIcon({ active, icon: Icon }: { active: boolean; icon: typeof LayoutDashboard }) {
  return (
    <Icon
      aria-hidden
      strokeWidth={active ? 2.2 : 1.8}
      className="h-6 w-6 transition-transform duration-quick ease-out group-active:scale-[0.88]"
    />
  )
}

/**
 * Phone tab bar: a floating, translucent pill of icons (four sections plus
 * "עוד", a sheet with the rest). Labels live in aria-label only.
 */
export function BottomNav() {
  const pathname = usePathname()
  const periodHref = usePeriodHref()
  const [moreOpen, setMoreOpen] = useState(false)

  // A link in the sheet navigates; close it once the page changes
  useEffect(() => setMoreOpen(false), [pathname])

  const moreActive = moreOpen || isMoreActive(pathname)
  const tabIndex = moreOpen ? -1 : TABS.findIndex(t => isNavActive(pathname, t.href))
  const activeSlot = moreActive ? TABS.length : tabIndex

  return (
    <nav
      aria-label="ניווט ראשי"
      className="glass-pill fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[45] mx-auto flex h-16 w-[min(22rem,calc(100%-2rem))] rounded-full p-1.5 md:hidden"
    >
      {/* Active highlight: one capsule that glides to the selected slot */}
      <span
        aria-hidden
        style={{ '--slot': Math.max(activeSlot, 0) } as React.CSSProperties}
        className={cn(
          'tab-highlight pointer-events-none absolute inset-y-1.5 start-1.5 w-[calc((100%-0.75rem)/5)] rounded-full',
          activeSlot < 0 && 'opacity-0'
        )}
      />

      {TABS.map(({ href, label, title, icon }) => {
        const active = !moreOpen && isNavActive(pathname, href)
        return (
          <Link
            key={href}
            href={periodHref(href)}
            aria-label={title ?? label}
            aria-current={isNavActive(pathname, href) ? 'page' : undefined}
            className={cn(TAB, active ? 'text-primary' : 'text-foreground/60')}
          >
            <TabIcon active={active} icon={icon} />
          </Link>
        )
      })}

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Trigger
          className={cn(TAB, moreActive ? 'text-primary' : 'text-foreground/60')}
          aria-label="עוד: העלאת קבצים, קטגוריות, הגדרות, אודות"
        >
          <TabIcon active={moreActive} icon={Ellipsis} />
        </Dialog.Trigger>
        <Dialog.Portal>
          {/* The pill sits above the scrim, so "עוד" stays visible (and tappable to close) */}
          <Dialog.Overlay className="sheet-scrim fixed inset-0 z-40 bg-black/45 md:hidden" />
          <Dialog.Content
            dir="rtl"
            aria-describedby={undefined}
            className="sheet fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-50 overflow-hidden rounded-3xl surface-overlay text-card-foreground focus:outline-none md:hidden"
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
                      href={periodHref(href)}
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
