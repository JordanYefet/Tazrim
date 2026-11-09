'use client'

import { createContext, useContext } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import { ChevronLeft, ChevronsUpDown, LockKeyhole, LogOut, Smartphone, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** The signed-in person (ENG-89): their name and how this browser signed in; null with the login off */
export interface Me {
  name: string
  /** The passkey's device label, or null when this browser signed in with a password or the recovery code */
  device: string | null
}

const MeContext = createContext<Me | null>(null)

export function MeProvider({ me, children }: { me: Me | null; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}

const initial = (name: string) => [...name.trim()][0] ?? '?'
const signedInWith = (me: Me) => (me.device ? `מפתח ב-${me.device}` : 'סיסמה')

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/settings/people', label: 'אנשים ומכשירים', icon: Users },
  { href: '/settings/people?open=device', label: 'הוספת מכשיר', icon: Smartphone },
  { href: '/settings/people?open=password', label: 'סיסמה', icon: LockKeyhole },
]

async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  window.location.assign('/login')
}

function Avatar({ me, className }: { me: Me; className?: string }) {
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary', className)}>
      {initial(me.name)}
    </span>
  )
}

const MENU_ITEM =
  'flex h-10 cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-muted'

/**
 * The bottom of the sidebar: who is signed in, opening a small menu (people
 * and devices, adding a device, the password, signing out). On the rail, the
 * avatar alone, with the name as a tooltip.
 */
export function SidebarProfile({ collapsed }: { collapsed: boolean }) {
  const me = useContext(MeContext)
  if (!me) return null
  const trigger = (
    <DropdownMenu.Trigger
      aria-label={`${me.name}: תפריט אישי`}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted'
      )}
    >
      <Avatar me={me} className="h-8 w-8 text-sm" />
      <span className={cn('flex min-w-0 flex-1 flex-col transition-opacity duration-quick motion-reduce:transition-none', collapsed && 'opacity-0')}>
        <span className="truncate text-sm font-semibold">{me.name}</span>
        <span className="truncate text-xs text-muted-foreground">{signedInWith(me)}</span>
      </span>
      <ChevronsUpDown className={cn('h-4 w-4 shrink-0 text-muted-foreground', collapsed && 'opacity-0')} aria-hidden />
    </DropdownMenu.Trigger>
  )
  return (
    <DropdownMenu.Root dir="rtl">
      {collapsed ? (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="left" sideOffset={8} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs text-background">
              {me.name}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ) : (
        trigger
      )}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          className="menu-panel z-50 w-60 rounded-2xl surface-overlay p-1.5 text-card-foreground shadow-e3"
        >
          <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-2">
            <Avatar me={me} className="h-10 w-10 text-base" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{me.name}</span>
              <span className="truncate text-xs text-muted-foreground">כניסה עם {signedInWith(me)}</span>
            </span>
          </div>
          <DropdownMenu.Separator className="mx-1.5 mb-1 h-px bg-border" />
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <DropdownMenu.Item key={href} asChild className={MENU_ITEM}>
              <Link href={href}>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="mx-1.5 my-1 h-px bg-border" />
          <DropdownMenu.Item onSelect={signOut} className={MENU_ITEM}>
            <LogOut className="h-4 w-4 -scale-x-100 text-muted-foreground" aria-hidden />
            יציאה
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * On phones (no sidebar): the top of the "עוד" sheet, as the account sits at
 * the top of iOS Settings: who is signed in, the same shortcuts, and signing out.
 */
export function SheetProfile({ onNavigate }: { onNavigate: () => void }) {
  const me = useContext(MeContext)
  if (!me) return null
  const row = 'flex min-h-12 items-center gap-3.5 px-4 text-[15px] transition-colors active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
  return (
    <section aria-label={me.name} className="border-b pb-1">
      <div className="flex items-center gap-3 px-4 pb-2 pt-3">
        <Avatar me={me} className="h-11 w-11 text-lg" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold">{me.name}</span>
          <span className="truncate text-[13px] text-muted-foreground">כניסה עם {signedInWith(me)}</span>
        </span>
      </div>
      <ul>
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} onClick={onNavigate} className={row}>
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={signOut} className={cn(row, 'w-full text-destructive dark:text-red-400')}>
            <LogOut className="h-5 w-5 -scale-x-100" aria-hidden />
            יציאה
          </button>
        </li>
      </ul>
    </section>
  )
}
