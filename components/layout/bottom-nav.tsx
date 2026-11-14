'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Building2, CreditCard, House, LayoutDashboard, Lightbulb, Tag } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isNavActive } from '@/lib/accounts/routes'
import { INSIGHTS_DEFAULT, isInsightsActive, readInsightsChoice } from '@/lib/nav/insights'
import { usePeriodHref } from './period-context'
import { useTabBubble } from './tab-bubble'
import { useTabBarShrunk } from '@/hooks/use-tab-bar-shrunk'

// Five pages, home in the middle slot like most phone apps; settings, uploads and the rest live in the profile card
const TABS: { href: string; label: string; title?: string; icon: typeof LayoutDashboard }[] = [
  { href: '/banks', label: 'בנקים', icon: Building2 },
  { href: '/cards', label: 'כרטיסים', title: 'כרטיסי אשראי', icon: CreditCard },
  { href: '/', label: 'ראשי', icon: House },
  { href: INSIGHTS_DEFAULT, label: 'תובנות', title: 'תובנות: תחזית, קבועים, ניתוח', icon: Lightbulb },
  { href: '/categories', label: 'קטגוריות', icon: Tag },
]

/** The tab is "on" for every page it holds, not only for its own href */
const tabActive = (pathname: string, href: string) =>
  href === INSIGHTS_DEFAULT ? isInsightsActive(pathname) : isNavActive(pathname, href)

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
 * Phone tab bar: a floating, translucent pill of icons (five pages). Labels live in aria-label only. The selected
 * tab's capsule can be held and dragged to another tab (tab-bubble.ts); a tap
 * moves it on touch-down, before the page answers.
 */
export function BottomNav() {
  const pathname = usePathname()
  const periodHref = usePeriodHref()
  // The insights page last chosen; read after mount so the server render and hydration agree
  const [insightsHref, setInsightsHref] = useState(INSIGHTS_DEFAULT)
  useEffect(() => setInsightsHref(readInsightsChoice()), [pathname])
  const tabHref = (href: string) => (href === INSIGHTS_DEFAULT ? insightsHref : href)
  // Settings, uploads and the like are not tabs: no slot, the capsule hides
  const activeSlot = TABS.findIndex(t => tabActive(pathname, t.href))

  const router = useRouter()
  const navRef = useRef<HTMLElement>(null)
  const capRef = useRef<HTMLSpanElement>(null)
  const bubble = useTabBubble({
    navRef,
    capRef,
    activeSlot,
    routeKey: pathname,
    onCommit: slot => {
      if (!tabActive(pathname, TABS[slot].href)) router.push(periodHref(tabHref(TABS[slot].href)))
      return slot
    },
  })

  // Shrinks on the header's beat while the page scrolls down; a touch on it expands it
  const { shrunk, engage } = useTabBarShrunk({ routeKey: pathname })

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
        const active = tabActive(pathname, href)
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
    </nav>
  )
}
