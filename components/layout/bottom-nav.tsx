'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Building2, ChevronLeft, CreditCard, Ellipsis, House, Info, LayoutDashboard, Lightbulb, Settings, Tag, Upload } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isNavActive } from '@/lib/accounts/routes'
import { isMoreActive } from '@/lib/nav/state'
import { INSIGHTS_DEFAULT, isInsightsActive, readInsightsChoice } from '@/lib/nav/insights'
import { usePeriodHref } from './period-context'
import { useOpenOrigin } from '@/components/ui/open-origin'
import { SheetProfile, useMe } from './profile-menu'
import { useTabBubble } from './tab-bubble'
import { useDragToDismiss } from '@/hooks/use-drag-to-dismiss'
import { useTabBarShrunk } from '@/hooks/use-tab-bar-shrunk'

// Home sits in the middle slot (of five, with "עוד" last), like most phone apps
const TABS: { href: string; label: string; title?: string; icon: typeof LayoutDashboard }[] = [
  { href: '/banks', label: 'בנקים', icon: Building2 },
  { href: '/cards', label: 'כרטיסים', title: 'כרטיסי אשראי', icon: CreditCard },
  { href: '/', label: 'ראשי', icon: House },
  { href: INSIGHTS_DEFAULT, label: 'תובנות', title: 'תובנות: תחזית, קבועים, ניתוח', icon: Lightbulb },
]

/** The tab is "on" for every page it holds, not only for its own href */
const tabActive = (pathname: string, href: string) =>
  href === INSIGHTS_DEFAULT ? isInsightsActive(pathname) : isNavActive(pathname, href)

const MORE_LINKS = [
  { href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
  { href: '/settings', label: 'הגדרות', hint: 'ערכת נושא · ניהול חשבונות', icon: Settings },
  { href: '/about', label: 'אודות', hint: 'הסיפור, פרטיות ויצירת קשר', icon: Info },
]

/** Signed in, these sit in the profile section at the top of the sheet (About as a Settings tile) */
const SIGNED_IN_ELSEWHERE = ['/settings', '/about']

// Each tab is a 1/5 slot of the pill; the active highlight slides between slots
const TAB =
  'group relative z-10 flex h-full min-w-0 flex-1 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

function TabIcon({ active, icon: Icon }: { active: boolean; icon: typeof LayoutDashboard }) {
  return (
    <Icon
      aria-hidden
      strokeWidth={active ? 2.2 : 1.8}
      className="h-6 w-6 transition-transform duration-quick ease-ui group-active:scale-[0.88]"
    />
  )
}

/**
 * Phone tab bar: a floating, translucent pill of icons (four sections plus
 * "עוד", a sheet with the rest). Labels live in aria-label only. The selected
 * tab's capsule can be held and dragged to another tab (tab-bubble.ts); a tap
 * moves it on touch-down, before the page answers.
 */
export function BottomNav() {
  const me = useMe()
  const pathname = usePathname()
  const periodHref = usePeriodHref()
  const [moreOpen, setMoreOpen] = useState(false)
  // The insights page last chosen; read after mount so the server render and hydration agree
  const [insightsHref, setInsightsHref] = useState(INSIGHTS_DEFAULT)
  useEffect(() => setInsightsHref(readInsightsChoice()), [pathname])
  const tabHref = (href: string) => (href === INSIGHTS_DEFAULT ? insightsHref : href)
  // A link in the sheet was tapped and its page is on its way: every page the sheet
  // opens lights "עוד", so the capsule stays there instead of falling back to the
  // page being left while the server answers
  const [leaving, setLeaving] = useState(false)
  const leaveThroughSheet = () => {
    setLeaving(true)
    setMoreOpen(false)
  }
  // The sheet rises out of the "עוד" tab: its x from the tap (or the focused tab)
  const sheetOrigin = useOpenOrigin()

  // A link in the sheet navigates; close it once the page changes
  useEffect(() => {
    setMoreOpen(false)
    setLeaving(false)
  }, [pathname])

  const sheetSide = moreOpen || leaving
  const moreActive = sheetSide || isMoreActive(pathname)
  const tabIndex = sheetSide ? -1 : TABS.findIndex(t => tabActive(pathname, t.href))
  const activeSlot = moreActive ? TABS.length : tabIndex
  // Where the capsule belongs once the sheet is closed: the page's own slot
  const pageSlot = isMoreActive(pathname) ? TABS.length : TABS.findIndex(t => tabActive(pathname, t.href))

  const router = useRouter()
  // The sheet follows a finger down and closes past ~40% or on a flick
  const sheetScrimRef = useRef<HTMLDivElement | null>(null)
  const sheetDragRef = useDragToDismiss({ scrimRef: sheetScrimRef, onDismiss: () => setMoreOpen(false) })
  const navRef = useRef<HTMLElement>(null)
  const capRef = useRef<HTMLSpanElement>(null)
  const bubble = useTabBubble({
    navRef,
    capRef,
    activeSlot,
    routeKey: pathname,
    onCommit: (slot, { dragged }) => {
      if (slot === TABS.length) {
        // Dropped on "עוד" opens the sheet; a tap on it toggles, as before
        const open = dragged || !moreOpen
        setMoreOpen(open)
        return open ? TABS.length : pageSlot
      }
      setMoreOpen(false)
      setLeaving(false)
      if (!tabActive(pathname, TABS[slot].href)) router.push(periodHref(tabHref(TABS[slot].href)))
      return slot
    },
  })

  // Shrinks on the header's beat while the page scrolls down; a touch on it expands it
  const { shrunk, engage } = useTabBarShrunk({ sheetOpen: sheetSide, routeKey: pathname })

  return (
    <nav
      ref={navRef}
      aria-label="ניווט ראשי"
      data-shrunk={shrunk || undefined}
      {...bubble}
      onPointerDown={e => {
        if (e.target instanceof Node && navRef.current?.contains(e.target)) engage()
        bubble.onPointerDown(e)
      }}
      // Over an open sheet too (Radix turns the page's pointer events off): the capsule can be dragged out of "עוד"
      className="tab-bar glass-pill pointer-events-auto fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[45] mx-auto flex h-16 w-[min(22rem,calc(100%-2rem))] rounded-full p-1.5 md:hidden"
    >
      {/* Active highlight: one capsule that glides to the selected slot */}
      <span
        ref={capRef}
        aria-hidden
        style={{ '--slot': Math.max(activeSlot, 0) } as React.CSSProperties}
        className={cn(
          'tab-highlight pointer-events-none absolute inset-y-1.5 start-1.5 w-[calc((100%-0.75rem)/5)] rounded-full',
          activeSlot < 0 && 'opacity-0'
        )}
      />

      {TABS.map(({ href, label, title, icon }) => {
        const active = !sheetSide && tabActive(pathname, href)
        return (
          <Link
            key={href}
            href={periodHref(tabHref(href))}
            // The whole page, fetched ahead and kept (next.config.ts staleTimes): a tap lands on a page
            // that is already here. Writes drop the kept pages (fresh-data.tsx)
            prefetch
            aria-label={title ?? label}
            aria-current={tabActive(pathname, href) ? 'page' : undefined}
            data-slot
            draggable={false}
            className={cn(TAB, active ? 'text-primary' : 'text-foreground/60')}
          >
            <TabIcon active={active} icon={icon} />
          </Link>
        )
      })}

      <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
        <Dialog.Trigger
          data-slot
          className={cn(TAB, moreActive ? 'text-primary' : 'text-foreground/60')}
          aria-label="עוד: העלאת קבצים, קטגוריות, הגדרות, אודות"
        >
          <TabIcon active={moreActive} icon={Ellipsis} />
        </Dialog.Trigger>
        <Dialog.Portal>
          {/* The pill sits above the scrim, so "עוד" stays visible (and tappable to close) */}
          <Dialog.Overlay ref={sheetScrimRef} className="sheet-scrim fixed inset-0 z-40 bg-black/45 md:hidden" />
          <Dialog.Content
            ref={el => {
              sheetOrigin(el)
              sheetDragRef(el)
            }}
            // A touch on the tab bar is the capsule's (it may be dragging out of "עוד"), not a tap outside
            onInteractOutside={e => {
              if (navRef.current?.contains(e.target as Node)) e.preventDefault()
            }}
            dir="rtl"
            aria-describedby={undefined}
            className="sheet fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-50 overflow-hidden rounded-3xl surface-overlay text-card-foreground focus:outline-none md:hidden"
          >
            <Dialog.Title className="sr-only">עוד</Dialog.Title>
            <div aria-hidden className="flex justify-center pt-2">
              <span className="h-1 w-9 rounded-full bg-border" />
            </div>
            <SheetProfile onNavigate={leaveThroughSheet} />
            <ul className="pb-1">
              {(me ? MORE_LINKS.filter(l => !SIGNED_IN_ELSEWHERE.includes(l.href)) : MORE_LINKS).map(({ href, label, hint, icon: Icon }, i) => {
                const active = isNavActive(pathname, href)
                return (
                  <li key={href}>
                    {i > 0 && <div aria-hidden className="ms-[3.25rem] h-px bg-border" />}
                    <Link
                      href={periodHref(href)}
                      aria-current={active ? 'page' : undefined}
                      onClick={leaveThroughSheet}
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
