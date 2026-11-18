'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, ListTree, PanelBottom, Ban } from 'lucide-react'
import { actionLabel } from '@/lib/log/page-names'
import { actionOf, countProblems, filterEntries, formatTime, groupedView, copyText, type Tab } from '@/lib/log/view'
import { cn } from '@/lib/utils/cn'
import { ConsoleList, DetailsPane } from './console'
import { setLogPrefs, useLogPrefs } from './prefs'
import { useLogStream } from './use-log-stream'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'app', label: 'App' },
  { id: 'sync', label: 'Sync' },
  { id: 'problems', label: 'Problems' },
]

const TOOL =
  'inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[hsl(var(--lc-dim))] hover:bg-[hsl(220_20%_20%)] hover:text-[hsl(var(--lc-fg))] md:h-7 md:w-7 max-md:h-9 max-md:w-9'

/** Posts a page change as an action marker; the log starts a new group at it (grouped view) */
function useActionMarkers(active: boolean) {
  const pathname = usePathname()
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (!active || last.current === pathname) return
    last.current = pathname
    const label = actionLabel(pathname)
    if (!label) return
    void fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
      keepalive: true,
    }).catch(() => {})
  }, [active, pathname])
}

/**
 * The floating log window (ENG-104), mounted once in the root layout. It exists only when the
 * switch in Settings → Debug is on for this device and the server lets this request see the log.
 * Bottom-left (the app is RTL, so the corner opposite the nav); on a phone a sheet above the
 * tab bar. It floats above the page and never moves it. States: a collapsed bar, open, and
 * enlarged with the details pane; the state, tab and grouping are remembered per device.
 */
export function LogWindow({ allowed }: { allowed: boolean }) {
  const prefs = useLogPrefs()
  const pathname = usePathname()
  const onLogs = pathname === '/logs' || pathname.startsWith('/logs/')
  const active = allowed && prefs.on
  useActionMarkers(active)
  const { entries, status, clear } = useLogStream({ enabled: active })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const visible = useMemo(() => filterEntries(entries, { detail: prefs.detail, tab: prefs.tab }), [entries, prefs.detail, prefs.tab])
  const groups = useMemo(() => (prefs.grouped ? groupedView(entries, { detail: prefs.detail, tab: prefs.tab }) : null), [entries, prefs.detail, prefs.tab, prefs.grouped])
  const problems = useMemo(() => countProblems(entries), [entries])
  const selected = selectedId == null ? null : entries.find(e => e.id === selectedId) ?? null

  if (!active || onLogs) return null

  const { mode } = prefs
  const problemCount = problems.errors + problems.warnings
  const live = status === 'live'

  // The bar's text: the latest line, or the latest action when grouped
  const latestGroup = groups?.at(-1)
  const lastLine = visible.at(-1)
  const barText = groups
    ? latestGroup
      ? `${latestGroup.title ?? 'לפני הפעולה הראשונה'} · ${latestGroup.lines.length} שורות`
      : 'אין שורות'
    : lastLine
      ? `${formatTime(lastLine.ts, false)} ${lastLine.msg}`
      : status === 'denied' ? 'אין הרשאה לראות את הלוגים' : 'אין שורות עדיין'
  const dot = problems.errors ? 'bg-[hsl(var(--lc-error))]' : problems.warnings ? 'bg-[hsl(var(--lc-warn))]' : 'bg-[hsl(var(--lc-ok))]'

  const copy = async () => {
    const text = copyText(visible, groups)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (http on a phone): nothing to do
    }
  }

  // Position: bottom-left on a computer; on a phone a sheet that ends above the tab bar (never over it)
  const place = 'fixed z-40 left-2.5 right-2.5 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] md:left-6 md:right-auto md:bottom-6'

  if (mode === 'min') {
    return (
      <button
        type="button"
        dir="ltr"
        onClick={() => setLogPrefs({ mode: 'open' })}
        aria-label={`פתיחת חלון הלוגים. ${problems.errors} שגיאות, ${problems.warnings} אזהרות`}
        className={cn(
          'log-console flex h-9 items-center gap-2.5 rounded-[10px] border border-[hsl(var(--lc-border))] px-3 text-left text-xs shadow-[0_10px_30px_hsl(224_60%_3%/0.25)] md:w-[460px] max-md:h-11',
          place
        )}
      >
        <span aria-hidden className={cn('h-[7px] w-[7px] shrink-0 rounded-full', dot)} />
        <span dir="auto" className="min-w-0 flex-1 truncate text-left font-sans text-[hsl(var(--lc-dim))]">{barText}</span>
        <span className="text-[hsl(var(--lc-error))]">{problems.errors} err</span>
        <span className="text-[hsl(var(--lc-warn))]">{problems.warnings} warn</span>
        <ChevronUp aria-hidden className="h-3.5 w-3.5" />
      </button>
    )
  }

  const max = mode === 'max'
  return (
    <section
      aria-label="חלון לוגים"
      dir="ltr"
      className={cn(
        'log-console flex flex-col overflow-hidden rounded-[18px] border border-[hsl(var(--lc-border))] shadow-[0_2px_4px_hsl(224_60%_3%/0.2),0_18px_48px_hsl(224_60%_3%/0.35)] md:rounded-xl',
        'h-[min(360px,calc(100dvh-11rem))] md:h-[340px] md:w-[640px] md:max-w-[calc(100vw-3rem)] md:max-h-[calc(100dvh-3rem)]',
        max && 'md:h-[440px] md:w-[1012px]',
        place
      )}
    >
      <div className="flex h-11 shrink-0 items-center border-b border-[hsl(var(--lc-rule))] ps-1 pe-1.5 md:h-[34px]">
        <div role="group" aria-label="סינון" className="flex">
          {TABS.map(t => {
            const on = prefs.tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setLogPrefs({ tab: t.id })}
                className={cn('h-11 px-2.5 text-xs md:h-[34px]', on ? 'text-[hsl(var(--lc-fg))] shadow-[inset_0_-2px_0_hsl(var(--lc-accent))]' : 'text-[hsl(var(--lc-dim))]')}
              >
                {t.label}
                {t.id === 'problems' && problemCount > 0 ? ` · ${problemCount}` : ''}
              </button>
            )
          })}
        </div>
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={prefs.grouped}
          onClick={() => setLogPrefs({ grouped: !prefs.grouped })}
          title="קיבוץ לפי פעולה"
          className={cn('inline-flex h-[26px] items-center gap-1.5 rounded-md px-2 text-xs max-md:hidden', prefs.grouped ? 'bg-[hsl(var(--lc-sel))] text-[hsl(var(--lc-fg))]' : 'text-[hsl(var(--lc-dim))]')}
        >
          <ListTree aria-hidden className="h-[13px] w-[13px]" />
          Group by action
        </button>
        <button
          type="button"
          aria-pressed={prefs.grouped}
          onClick={() => setLogPrefs({ grouped: !prefs.grouped })}
          aria-label="קיבוץ לפי פעולה"
          title="קיבוץ לפי פעולה"
          className={cn(TOOL, 'md:hidden', prefs.grouped && 'bg-[hsl(var(--lc-sel))] text-[hsl(var(--lc-fg))]')}
        >
          <ListTree aria-hidden className="h-4 w-4" />
        </button>
        <span
          className={cn('inline-flex items-center gap-1.5 pe-2 ps-2 text-[11px] max-md:hidden', live ? 'text-[hsl(var(--lc-ok))]' : 'text-[hsl(var(--lc-dim))]')}
          role="status"
        >
          <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-[hsl(var(--lc-ok))]' : 'bg-[hsl(var(--lc-dim))]')} />
          {live ? 'live' : status === 'denied' ? 'no access' : status === 'offline' ? 'offline' : '…'}
        </span>
        <button type="button" onClick={copy} aria-label="העתקה" title="העתקה" className={TOOL}>
          {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          <span className="sr-only" role="status">{copied ? 'הועתק' : ''}</span>
        </button>
        <button type="button" onClick={() => { void clear(); setSelectedId(null) }} aria-label="ניקוי" title="ניקוי" className={TOOL}>
          <Ban aria-hidden className="h-3.5 w-3.5" />
        </button>
        <Link href="/logs" aria-label="פתיחה בעמוד הלוגים" title="פתיחה בעמוד הלוגים" className={TOOL}>
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => setLogPrefs({ mode: max ? 'open' : 'max' })}
          aria-label={max ? 'הקטנה' : 'הגדלה עם פרטים'}
          title={max ? 'הקטנה' : 'הגדלה עם פרטים'}
          className={cn(TOOL, 'max-md:hidden')}
        >
          <PanelBottom aria-hidden className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setLogPrefs({ mode: 'min' })} aria-label="מזעור" title="מזעור" className={TOOL}>
          <ChevronDown aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <ConsoleList
          lines={visible}
          groups={groups}
          selectedId={selectedId}
          onSelect={id => {
            setSelectedId(id)
            // On a computer a picked line opens the details pane, as the enlarged window
            if (id != null && window.matchMedia('(min-width: 768px)').matches) setLogPrefs({ mode: 'max' })
          }}
          inline="phone"
          hasAny={entries.length > 0 || status === 'denied'}
          size="sm"
          emptyText={status === 'denied' ? 'אין הרשאה לראות את הלוגים מהמכשיר הזה.' : 'אין שורות שמתאימות לסינון.'}
        />
        {max && <DetailsPane entry={selected} action={selected ? actionOf(entries, selected.id) : null} className="w-[360px] max-md:hidden" />}
      </div>
    </section>
  )
}
