'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LogEntry, LogLevel } from '@/lib/log/buffer'
import { detailsJson, formatTime, isAction, type Group } from '@/lib/log/view'
import { cn } from '@/lib/utils/cn'

export const LEVEL_TEXT: Record<LogLevel, string> = {
  debug: 'text-[hsl(var(--lc-dim))]',
  info: 'text-[hsl(var(--lc-info))]',
  warn: 'text-[hsl(var(--lc-warn))]',
  error: 'text-[hsl(var(--lc-error))]',
}
const MSG_TEXT: Record<LogLevel, string> = {
  debug: 'text-[hsl(var(--lc-dim))]',
  info: 'text-[hsl(var(--lc-msg))]',
  warn: 'text-[hsl(var(--lc-msg))]',
  error: 'text-[hsl(var(--lc-error))]',
}
const WORST_DOT = { ok: 'bg-[hsl(var(--lc-ok))]', warn: 'bg-[hsl(var(--lc-warn))]', error: 'bg-[hsl(var(--lc-error))]' }
const WORST_TEXT = { ok: 'ללא בעיות', warn: 'יש אזהרות', error: 'יש שגיאות' }

/** One line: time, level, source, message. A real button: it selects the line for its details. */
function Row({ e, selected, onSelect, size, indent }: { e: LogEntry; selected: boolean; onSelect: () => void; size: 'sm' | 'md'; indent: boolean }) {
  // An action (a page change) is a quiet divider, not a log line: the app's font, muted, no level or source
  if (isAction(e)) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'flex w-full items-center gap-3 whitespace-nowrap pe-4 text-left font-sans leading-[1.85] text-[hsl(var(--lc-dim))] hover:bg-[hsl(var(--lc-hover))]',
          size === 'sm' ? 'text-xs' : 'text-[0.78rem]',
          indent ? 'ps-[34px]' : 'ps-3.5',
          selected && 'bg-[hsl(var(--lc-sel))] hover:bg-[hsl(var(--lc-sel))]'
        )}
      >
        <span className="font-mono tabular-nums text-[hsl(var(--lc-faint))]">{formatTime(e.ts)}</span>
        <span aria-hidden>→</span>
        <span dir="auto">{e.msg}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full gap-3 whitespace-nowrap pe-4 text-left leading-[1.85] hover:bg-[hsl(var(--lc-hover))]',
        size === 'sm' ? 'text-xs' : 'text-[0.78rem]',
        indent ? 'ps-[34px]' : 'ps-3.5',
        selected && 'bg-[hsl(var(--lc-sel))] hover:bg-[hsl(var(--lc-sel))]'
      )}
    >
      <span className="text-[hsl(var(--lc-faint))] tabular-nums">{formatTime(e.ts)}</span>
      <span className={cn('w-10 font-medium', LEVEL_TEXT[e.level])}>{e.level.toUpperCase()}</span>
      <span className="w-9 text-[hsl(var(--lc-dim))]">{e.source}</span>
      <span dir="auto" className={MSG_TEXT[e.level]}>{e.msg}</span>
    </button>
  )
}

export interface ConsoleListProps {
  /** Flat view: the lines, oldest first */
  lines: LogEntry[]
  /** Grouped view when given */
  groups: Group[] | null
  selectedId: number | null
  onSelect: (id: number | null) => void
  size?: 'sm' | 'md'
  /** Where a selected line's JSON opens under it: never (a details pane has it), on phones only, or always */
  inline?: 'none' | 'phone' | 'always'
  /** Scrolled into view when it changes (a run picked on /logs) */
  revealId?: number | null
  /** Why the list is empty when a filter or search hides everything */
  emptyText: string
  /** Anything has been logged at all (else the empty state says nothing happened yet) */
  hasAny: boolean
  className?: string
}

/**
 * The console's list: flat or grouped by action, newest at the bottom. It follows the newest
 * line until the reader scrolls up; then it stays put and offers "N new ↓". The button is
 * always in its place, dimmed when there is nothing new (stable layout).
 */
export function ConsoleList({ lines, groups, selectedId, onSelect, size = 'sm', inline = 'none', revealId, emptyText, hasAny, className }: ConsoleListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevTail = useRef(0)
  const [fresh, setFresh] = useState(0)
  const [closed, setClosed] = useState<Set<number>>(new Set())

  const tail = lines.length ? lines[lines.length - 1].id : 0
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (stick.current) {
      el.scrollTop = el.scrollHeight
      setFresh(0)
    } else if (tail > prevTail.current) {
      setFresh(n => n + lines.filter(l => l.id > prevTail.current).length)
    }
    prevTail.current = tail
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new last line moves it
  }, [tail, groups])

  useLayoutEffect(() => {
    if (revealId == null) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-line="${revealId}"]`)
    if (el) {
      stick.current = false
      el.scrollIntoView({ block: 'center' })
    }
  }, [revealId])

  const down = () => {
    const el = scroller.current
    if (!el) return
    stick.current = true
    el.scrollTop = el.scrollHeight
    setFresh(0)
  }

  const line = (e: LogEntry, indent: boolean) => {
    const selected = e.id === selectedId
    return (
      <div key={e.id} data-line={e.id}>
        <Row e={e} selected={selected} indent={indent} size={size} onSelect={() => onSelect(inline === 'always' && selected ? null : e.id)} />
        {selected && inline !== 'none' && (
          <pre
            className={cn(
              'mx-3.5 mb-2 mt-0.5 overflow-auto whitespace-pre-wrap rounded-lg bg-[hsl(var(--lc-deep))] px-3 py-2.5 text-xs leading-[1.7] text-[hsl(var(--lc-msg))]',
              inline === 'phone' && 'md:hidden',
              inline === 'always' && 'border border-[hsl(var(--lc-rule))] ms-[236px] me-5'
            )}
          >
            {detailsJson(e)}
          </pre>
        )}
      </div>
    )
  }

  const empty = groups ? groups.length === 0 : lines.length === 0

  return (
    <div className={cn('relative min-h-0 min-w-0 flex-1', className)}>
      <div
        ref={scroller}
        dir="ltr"
        role="log"
        aria-label="שורות הלוג"
        tabIndex={0}
        onScroll={e => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          if (stick.current) setFresh(0)
        }}
        className="h-full overflow-auto pb-2 pt-1"
      >
        {empty && <p dir="rtl" className="px-4 py-10 text-center font-sans text-sm text-[hsl(var(--lc-dim))]">{hasAny ? emptyText : 'עוד אין לוגים. הם יופיעו כאן כשמשהו יקרה באפליקציה.'}</p>}
        {!groups && lines.map(e => line(e, false))}
        {groups?.map(g => {
          const open = !closed.has(g.id)
          return (
            <div key={g.id} className="border-b border-[hsl(var(--lc-rule))]">
              <button
                type="button"
                aria-expanded={open}
                disabled={g.lines.length === 0}
                onClick={() => setClosed(c => { const n = new Set(c); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n })}
                className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left font-sans text-[0.8125rem] hover:bg-[hsl(var(--lc-hover))] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <ChevronRight
                  aria-hidden
                  className={cn('h-3 w-3 shrink-0 text-[hsl(var(--lc-dim))] transition-transform duration-fast ease-ui motion-reduce:transition-none', open && g.lines.length > 0 && 'rotate-90', g.lines.length === 0 && 'opacity-30')}
                />
                <span className={cn('h-2 w-2 shrink-0 rounded-full', WORST_DOT[g.worst])}><span className="sr-only">{WORST_TEXT[g.worst]}</span></span>
                <span dir="auto" className="flex-1 text-left font-medium">{g.title ?? 'לפני הפעולה הראשונה'}</span>
                <span className="font-mono text-[11px] text-[hsl(var(--lc-dim))]">{g.lines.length} {g.lines.length === 1 ? 'line' : 'lines'}</span>
                <span className="font-mono text-[11px] tabular-nums text-[hsl(var(--lc-dim))]">{formatTime(g.ts, false)}</span>
              </button>
              {open && g.lines.length > 0 && <div className="pb-1">{g.lines.map(e => line(e, true))}</div>}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        onClick={down}
        tabIndex={fresh ? 0 : -1}
        aria-hidden={fresh ? undefined : true}
        className={cn(
          'absolute bottom-3 end-4 rounded-full bg-[hsl(var(--lc-accent))] px-3 py-1 font-sans text-xs font-medium text-[hsl(220_28%_9%)] shadow-lg transition-opacity duration-fast motion-reduce:transition-none',
          fresh ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        {fresh} חדשות ↓
      </button>
    </div>
  )
}

/** The enlarged window's and /logs's side pane: the selected line and its fields as JSON */
export function DetailsPane({ entry, action, className }: { entry: LogEntry | null; action: string | null; className?: string }) {
  return (
    <aside aria-label="פרטי השורה" dir="ltr" className={cn('flex shrink-0 flex-col gap-2.5 overflow-auto border-s border-[hsl(var(--lc-rule))] p-4 text-xs leading-[1.7]', className)}>
      <span className="text-[11px] tracking-[0.06em] text-[hsl(var(--lc-dim))]">DETAILS</span>
      {entry ? (
        <>
          {action && <span dir="auto" className="text-left font-sans text-[0.8125rem] text-[hsl(var(--lc-dim))]">{action}</span>}
          <span dir="auto" className={cn('break-words', LEVEL_TEXT[entry.level])}>{entry.msg}</span>
          <span className="text-[hsl(var(--lc-dim))]">{formatTime(entry.ts)}</span>
          <pre className="m-0 whitespace-pre-wrap break-words rounded-lg bg-[hsl(var(--lc-deep))] px-3 py-2.5 text-[hsl(var(--lc-msg))]">{detailsJson(entry)}</pre>
        </>
      ) : (
        <span dir="rtl" className="font-sans text-[hsl(var(--lc-dim))]">בוחרים שורה כדי לראות את פרטיה.</span>
      )}
    </aside>
  )
}
