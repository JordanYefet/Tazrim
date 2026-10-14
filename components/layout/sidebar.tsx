'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ChevronDown, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isNavActive } from '@/lib/accounts/routes'
import {
  SECTIONS_COOKIE,
  SIDEBAR_COOKIE,
  cookieAssignment,
  routeAccountId,
  serializeClosedSections,
  toggleSection,
  type NavSectionKey,
} from '@/lib/nav/state'
import { MAIN_NAV, SETTINGS_NAV, useNavSections, type NavLinkItem, type NavSectionItem } from './nav-context'
import { RailFlyout } from './rail-flyout'

/*
 * One markup for both widths: every icon sits 32px from the inline-start
 * edge (12px nav padding + 12px item padding + half the 16px icon), so when
 * the sidebar folds to the 64px rail the icons stay put and only the labels
 * are clipped and faded.
 */
const ITEM =
  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const IDLE = 'text-muted-foreground hover:bg-muted hover:text-foreground'
const ACTIVE = 'bg-primary/10 text-primary font-medium'
// The width eases out without overshoot (critically damped feel), and stays put under reduced motion
const WIDTH_MOTION = 'transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none'

function writeCookie(name: string, value: string) {
  document.cookie = cookieAssignment(name, value)
}

function Label({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none',
        collapsed && 'opacity-0'
      )}
    >
      {children}
    </span>
  )
}

/** Tooltip with the item's name, only on the rail (the label is visible otherwise). */
function RailTip({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="left"
          sideOffset={10}
          className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function PlainItem({ item, pathname, collapsed }: { item: NavLinkItem; pathname: string; collapsed: boolean }) {
  const active = isNavActive(pathname, item.href)
  const Icon = item.icon
  return (
    <RailTip show={collapsed} label={item.label}>
      <Link
        href={item.href}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={cn(ITEM, active ? ACTIVE : IDLE)}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <Label collapsed={collapsed}>{item.label}</Label>
      </Link>
    </RailTip>
  )
}

function SectionItem({
  item,
  pathname,
  collapsed,
  open,
  onToggle,
}: {
  item: NavSectionItem
  pathname: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  const accounts = useNavSections()[item.key]
  const active = isNavActive(pathname, item.href)
  const currentId = routeAccountId(pathname, item.kind)
  const Icon = item.icon
  const listId = `nav-${item.key}-accounts`
  const expanded = open && !collapsed && accounts.length > 0

  const row = (
    <Link
      href={item.href}
      aria-label={collapsed ? item.label : undefined}
      aria-current={pathname === item.href ? 'page' : undefined}
      className={cn(ITEM, active ? ACTIVE : IDLE, accounts.length > 0 && !collapsed && 'pe-10')}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <Label collapsed={collapsed}>{item.label}</Label>
    </Link>
  )

  if (collapsed) {
    return accounts.length ? (
      <RailFlyout item={item} accounts={accounts} currentId={currentId} pathname={pathname}>
        {row}
      </RailFlyout>
    ) : (
      <RailTip show label={item.label}>{row}</RailTip>
    )
  }

  return (
    <div>
      <div className="relative">
        {row}
        {accounts.length > 0 && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={listId}
            aria-label={expanded ? `הסתר את רשימת ${item.label}` : `הצג את רשימת ${item.label}`}
            className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                !expanded && 'rotate-90'
              )}
              aria-hidden
            />
          </button>
        )}
      </div>
      {accounts.length > 0 && (
        // 0fr ↔ 1fr rows animate the height without measuring it
        <div
          id={listId}
          inert={!expanded}
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <ul className="ms-5 flex flex-col gap-px border-s ps-2 pt-0.5 pb-1">
              {accounts.map(a => {
                const current = a.id === currentId
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      aria-current={current ? 'page' : undefined}
                      title={a.lastFour ? `${a.name} ·${a.lastFour}` : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        current ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="min-w-0 truncate">{a.name}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export function Sidebar({
  initialCollapsed,
  initialClosed,
}: {
  initialCollapsed: boolean
  initialClosed: NavSectionKey[]
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [closed, setClosed] = useState(initialClosed)

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    writeCookie(SIDEBAR_COOKIE, next ? 'collapsed' : 'expanded')
  }

  function toggle(key: NavSectionKey) {
    const next = toggleSection(closed, key)
    setClosed(next)
    writeCookie(SECTIONS_COOKIE, serializeClosedSections(next))
  }

  const ToggleIcon = collapsed ? PanelRightOpen : PanelRightClose
  const toggleLabel = collapsed ? 'הרחב תפריט' : 'כווץ תפריט'
  const toggleButton = (
    <RailTip show={collapsed} label={toggleLabel}>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={collapsed ? undefined : toggleLabel}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <ToggleIcon className="h-4 w-4" aria-hidden />
      </button>
    </RailTip>
  )

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400} disableHoverableContent>
      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 self-start flex-col overflow-hidden border-e bg-card md:flex',
          WIDTH_MOTION,
          collapsed ? 'w-16' : 'w-56'
        )}
      >
        {/* The toggle stays in one spot in both widths: first in the top row, centred
            on the rail's 32px axis. The logo follows it and fades out when collapsed. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
          {toggleButton}
          <Link
            href="/"
            aria-label="תזרים · לוח בקרה"
            tabIndex={collapsed ? -1 : undefined}
            aria-hidden={collapsed || undefined}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-lg transition-opacity duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'pointer-events-none opacity-0'
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">ת</span>
            </span>
            <span className="whitespace-nowrap text-lg font-bold tracking-tight">תזרים</span>
          </Link>
        </div>

        <nav aria-label="ניווט ראשי" className={cn('flex flex-1 flex-col gap-0.5 p-3', collapsed ? 'overflow-visible' : 'overflow-y-auto')}>
          {MAIN_NAV.map(item =>
            item.type === 'section' ? (
              <SectionItem
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                open={!closed.includes(item.key)}
                onToggle={() => toggle(item.key)}
              />
            ) : (
              <PlainItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            )
          )}
        </nav>

        <div className="flex shrink-0 flex-col gap-0.5 border-t p-3">
          <PlainItem item={SETTINGS_NAV} pathname={pathname} collapsed={collapsed} />
        </div>
      </aside>
    </Tooltip.Provider>
  )
}
