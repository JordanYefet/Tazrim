'use client'

import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { monthName, monthsArray } from '@/lib/utils/date'
import { stepPeriod, type Period } from '@/lib/period'

const MONTHS = monthsArray()

const ARROW =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const CELL =
  'h-10 rounded-[10px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const PICKED = 'bg-primary font-semibold text-primary-foreground'
const IDLE = 'border border-foreground/[0.06] bg-foreground/[0.04] hover:bg-foreground/[0.08]'
// Months that haven't happened yet: still pickable, drawn as empty slots
const LATER = 'border border-dashed border-foreground/[0.12] text-muted-foreground/70 hover:bg-foreground/[0.04]'

/**
 * The header's period: one month back / forward on the arrows (crossing years;
 * a whole year when all months are shown), and the month grid on the middle
 * button: a panel under it on md+, a sheet from the bottom on phones.
 */
export function PeriodPicker({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(period.year)
  const [anchor, setAnchor] = useState({ top: 0, center: 0 })
  const trigger = useRef<HTMLButtonElement>(null)

  const now = new Date()
  const label = period.month ? `${monthName(period.month)} ${period.year}` : `כל ${period.year}`

  function openChange(next: boolean) {
    if (next) {
      setViewYear(period.year)
      const r = trigger.current?.getBoundingClientRect()
      if (r) setAnchor({ top: r.bottom + 8, center: r.left + r.width / 2 })
    }
    setOpen(next)
  }

  function pick(next: Period) {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="flex h-9 items-center gap-0.5 rounded-xl border border-border bg-muted/70 p-0.5">
      <button type="button" aria-label="התקופה הקודמת" onClick={() => onChange(stepPeriod(period, -1))} className={ARROW}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>

      <Dialog.Root open={open} onOpenChange={openChange}>
        <Dialog.Trigger
          ref={trigger}
          aria-label={`תקופה: ${label}. בחירת חודש ושנה`}
          className={cn(
            'h-8 min-w-[7.5rem] rounded-[9px] px-3 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open ? 'bg-primary/15 text-foreground' : 'bg-foreground/[0.05] hover:bg-foreground/[0.09]'
          )}
        >
          {label}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-scrim fixed inset-0 z-40 bg-black/45 md:bg-transparent" />
          <Dialog.Content
            dir="rtl"
            aria-describedby={undefined}
            // Focus starts on the picked month (or "כל השנה")
            onOpenAutoFocus={e => {
              const picked = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-pressed="true"]')
              if (!picked) return
              e.preventDefault()
              picked.focus()
            }}
            style={{ '--pp-top': `${anchor.top}px`, '--pp-left': `${anchor.center}px` } as React.CSSProperties}
            className={cn(
              'sheet fixed z-50 flex flex-col gap-3 rounded-3xl p-4 surface-overlay text-card-foreground focus:outline-none',
              // Phones: a sheet above the bottom bar
              'inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
              // md+: centred under the button
              'md:inset-x-auto md:bottom-auto md:left-[calc(var(--pp-left)-9.25rem)] md:top-[var(--pp-top)] md:w-[18.5rem] md:rounded-2xl md:p-3.5 md:origin-top'
            )}
          >
            <Dialog.Title className="sr-only">בחירת תקופה</Dialog.Title>
            <div aria-hidden className="flex justify-center md:hidden">
              <span className="h-1 w-9 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between">
              <button type="button" aria-label="השנה הקודמת" onClick={() => setViewYear(y => y - 1)} className={ARROW}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
              <span className="text-base font-semibold tabular-nums" aria-live="polite">{viewYear}</span>
              <button type="button" aria-label="השנה הבאה" onClick={() => setViewYear(y => y + 1)} className={ARROW}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {MONTHS.map(m => {
                const picked = period.year === viewYear && period.month === m.value
                const later = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && m.value > now.getMonth() + 1)
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => pick({ year: viewYear, month: m.value })}
                    className={cn(CELL, picked ? PICKED : later ? LATER : IDLE)}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              aria-pressed={period.year === viewYear && !period.month}
              onClick={() => pick({ year: viewYear })}
              className={cn(
                CELL,
                period.year === viewYear && !period.month ? PICKED : 'border border-foreground/10 hover:bg-foreground/[0.06]'
              )}
            >
              כל השנה
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <button type="button" aria-label="התקופה הבאה" onClick={() => onChange(stepPeriod(period, 1))} className={ARROW}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
