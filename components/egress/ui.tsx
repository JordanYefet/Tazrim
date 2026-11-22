'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export const INPUT =
  'h-11 w-full rounded-lg border bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 md:h-10 md:text-sm'
export const PRIMARY =
  'relative inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 md:h-10'
export const SECONDARY =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 md:h-10'
/** A quiet row action (remove, approve): 44px tall */
export const ROW_ACTION =
  '-me-2 inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-primary transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

/** The button's label stays where it is while it works: a spinner sits over it */
export function Busy({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <>
      <span className={cn(busy && 'invisible')}>{children}</span>
      {busy && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
    </>
  )
}

const time = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const day = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' })

/** "14:03:22" today, "3.11 14:03" another day */
export function When({ at }: { at: number | string }) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date().toDateString() === d.toDateString()
  const text = today ? time.format(d) : `${day.format(d)} ${time.format(d).slice(0, 5)}`
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning className="tabular-nums" dir="ltr">
      {text}
    </time>
  )
}

/** A domain or host: always left to right, breaking only where it must */
export function Host({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn('break-all font-mono text-[0.8125rem]', className)}>
      {children}
    </bdi>
  )
}
