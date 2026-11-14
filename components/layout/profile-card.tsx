'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AlertCircle, ChevronLeft, Check, LogOut, MessageSquare, RefreshCw, Settings, Upload, User } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { avatarMark, profileRows, type AvatarMark } from '@/lib/nav/profile-card'
import { face, needsCodeNow, type Tone } from '@/components/sync/sync-face'
import { SyncDialog } from '@/components/sync/sync-dialog'
import { useSync } from '@/components/sync/use-sync'
import { Avatar, MENU_ITEM, signOut, signedInWith, useMe } from './profile-menu'
import { usePeriodHref } from './period-context'

/** The corner badge: amber for a code or something to look at, green for done, red for a failure */
function Badge({ mark }: { mark: AvatarMark }) {
  if (mark === 'none' || mark === 'ring') return null
  const tone =
    mark === 'done'
      ? 'bg-emerald-600 dark:bg-emerald-500'
      : mark === 'failed'
        ? 'bg-red-600 dark:bg-red-500'
        : 'bg-amber-600 dark:bg-amber-500'
  return (
    <span
      aria-hidden
      className={cn(
        'absolute -end-[3px] -top-[3px] flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background px-1 text-[9.5px] font-bold leading-none text-white',
        tone
      )}
    >
      {mark === 'code' && <MessageSquare className="h-[9px] w-[9px]" strokeWidth={3.5} />}
      {mark === 'done' && <Check className="h-[9px] w-[9px]" strokeWidth={3.5} />}
      {(mark === 'alert' || mark === 'failed') && '!'}
    </span>
  )
}

const BLOCK: Record<Tone, string> = {
  idle: 'bg-muted/60 data-[highlighted]:bg-muted',
  busy: 'bg-muted/60 data-[highlighted]:bg-muted',
  done: 'bg-muted/60 data-[highlighted]:bg-muted',
  attention: 'bg-amber-500/10 data-[highlighted]:bg-amber-500/20',
  failed: 'bg-red-500/10 data-[highlighted]:bg-red-500/20',
}
// The sync icon's colour: muted like the other rows' icons, amber or red when it needs you
const TILE: Record<Tone, string> = {
  idle: 'text-muted-foreground',
  busy: 'text-primary',
  done: 'text-muted-foreground',
  attention: 'text-amber-700 dark:text-amber-300',
  failed: 'text-red-700 dark:text-red-300',
}
const GO: Record<Tone, string> = {
  idle: 'bg-primary text-primary-foreground',
  busy: 'bg-primary text-primary-foreground',
  done: 'bg-primary text-primary-foreground',
  attention: 'bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950',
  failed: 'bg-primary text-primary-foreground',
}

/**
 * The header's profile avatar (replaces the sync button, ENG-91): the person's initial, or a
 * plain person with the login off. It wears the sync's state (a ring turning while it runs, a
 * badge for a code, done or failed) and opens a small card: sync, uploads, settings, people and
 * devices, signing out. The sync row opens the sync panel (SyncDialog), which holds the work.
 */
export function ProfileButton() {
  const me = useMe()
  const sync = useSync()
  const periodHref = usePeriodHref()
  const [open, setOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [seenFailure, setSeenFailure] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const openingSync = useRef(false)

  // Ticks "לפני 3 דקות" along, and ends the "עודכן" moment
  useEffect(() => {
    const recent = sync.run?.status.state === 'done' || !!sync.queue?.finishedAt
    const id = setInterval(() => setNow(Date.now()), recent ? 1000 : 30_000)
    return () => clearInterval(id)
  }, [sync.run?.status.state, sync.queue?.finishedAt])

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    void sync.reload()
    // Opening the card counts as looking at a failure
    if (sync.queue?.finishedAt) setSeenFailure(sync.queue.id)
    else if (sync.run?.status.state === 'failed') setSeenFailure(sync.run.id)
  }

  function openSync() {
    openingSync.current = true
    setAnchor(trigger.current?.getBoundingClientRect() ?? null)
    setSyncOpen(true)
  }

  const { tone, title, sub } = face(sync.run, sync.queue, sync.info, now, seenFailure)
  // At rest the row names what it does; the button beside it already says "סנכרון"
  const rowTitle = tone === 'idle' ? 'סנכרון חשבונות' : title
  const needsCode = needsCodeNow(sync.run, sync.queue)
  const mark = avatarMark(tone, needsCode)
  const rows = profileRows(!!me)
  const has = (r: (typeof rows)[number]) => rows.includes(r)
  const TileIcon = tone === 'attention' ? (needsCode ? MessageSquare : AlertCircle) : tone === 'failed' ? AlertCircle : RefreshCw
  const goLabel = tone === 'attention' ? (needsCode ? 'הזנה' : 'פתיחה') : 'סנכרון'

  return (
    <>
      <DropdownMenu.Root dir="rtl" modal={false} open={open} onOpenChange={onOpenChange}>
        <DropdownMenu.Trigger
          ref={trigger}
          aria-label={`${me?.name ?? 'תפריט'}: ${title}, ${sub}`}
          className={cn(
            // A fixed 36px box in every state; the ring and badge hang outside it
            'relative flex h-9 w-9 shrink-0 items-center justify-center text-primary transition-shadow duration-quick ease-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            // the 44px hit area around the 36px circle
            'before:absolute before:-inset-1 before:content-[""]',
            // A rounded square with a person; the plain person icon (login off) keeps its circle
            me ? 'rounded-[30%]' : 'rounded-full bg-primary/10',
            // Open: a ring around it. While a sync runs, its moving ring takes that place instead
            (open || syncOpen) && mark !== 'ring' && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          )}
        >
          {me ? <Avatar me={me} size={36} /> : <User className="h-[18px] w-[18px]" aria-hidden />}
          {mark === 'ring' && (
            // The outline stays put and a bright arc travels around it (globals.css, .sync-ring):
            // spinning the shape itself only works for a circle
            <span aria-hidden className={cn('sync-ring', me ? 'rounded-[34%]' : 'rounded-full')} />
          )}
          <Badge mark={mark} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
            onCloseAutoFocus={e => {
              // The sync panel takes the focus when it opens in the card's place
              if (openingSync.current) {
                openingSync.current = false
                e.preventDefault()
              }
            }}
            // Grows out of the avatar: the card's start (right, in RTL) edge lines up with the
            // avatar's, so its centre is 18px in from that edge. Radix's own origin assumes LTR here
            style={{ transformOrigin: 'calc(100% - 18px) 0' }}
            className="menu-panel z-50 w-[17rem] rounded-2xl surface-overlay p-1.5 text-card-foreground shadow-e3"
          >
            {me && has('who') && (
              <>
                {/* Who is signed in; opens People and devices (it has no row of its own) */}
                <DropdownMenu.Item asChild className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 outline-none transition-colors data-[highlighted]:bg-muted">
                  <Link href="/settings/people" aria-label={`${me.name}: אנשים ומכשירים`}>
                    <Avatar me={me} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold">{me.name}</span>
                      <span className="truncate text-xs text-muted-foreground">כניסה עם {signedInWith(me)}</span>
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
                  </Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="mx-1.5 my-1 h-px bg-border" />
              </>
            )}
            {has('sync') && (
              <DropdownMenu.Item
                onSelect={openSync}
                className={cn('my-0.5 flex cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors', BLOCK[tone])}
              >
                {/* The same 16px icon as the rows below, in the same column; tinted by the sync's state */}
                <TileIcon aria-hidden className={cn('h-4 w-4 shrink-0', TILE[tone], tone === 'busy' && 'animate-spin motion-reduce:animate-none')} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{rowTitle}</span>
                  <span className="truncate text-xs text-muted-foreground">{sub}</span>
                </span>
                {/* Stays in place while busy, dimmed; the row as a whole opens the panel */}
                <span aria-hidden className={cn('flex h-8 shrink-0 items-center rounded-[10px] px-3 text-[13px] font-semibold', GO[tone], tone === 'busy' && 'opacity-40')}>
                  {goLabel}
                </span>
              </DropdownMenu.Item>
            )}
            {has('upload') && (
              <DropdownMenu.Item asChild className={MENU_ITEM}>
                <Link href={periodHref('/upload')}>
                  <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
                  העלאת קבצים
                </Link>
              </DropdownMenu.Item>
            )}
            {has('settings') && (
              <DropdownMenu.Item asChild className={MENU_ITEM}>
                <Link href="/settings">
                  <Settings className="h-4 w-4 text-muted-foreground" aria-hidden />
                  הגדרות
                </Link>
              </DropdownMenu.Item>
            )}
            {has('signout') && <DropdownMenu.Separator className="mx-1.5 my-1 h-px bg-border" />}
            {has('signout') && (
              <DropdownMenu.Item onSelect={signOut} className={cn(MENU_ITEM, 'text-destructive')}>
                <LogOut className="h-4 w-4 -scale-x-100 text-destructive" aria-hidden />
                יציאה
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} sync={sync} anchorRect={anchor} />
    </>
  )
}
