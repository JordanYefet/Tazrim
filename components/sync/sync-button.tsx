'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Check, ChevronDown, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useOpenOrigin } from '@/components/ui/open-origin'
import { STEP_TEXT, timeAgo } from '@/lib/sync/format'
import { useSync, type SyncInfo } from './use-sync'
import { SyncPanel } from './sync-panel'
import type { QueueView, RunView } from '@/lib/sync/runs'

/** How long "עודכן · 12 חדשות" stays on the button after a sync */
const DONE_SHOWN_MS = 8000

type Tone = 'idle' | 'busy' | 'attention' | 'done' | 'failed'

function lastSynced(info: SyncInfo | null): string | null {
  const times = (info?.companies ?? []).map(c => c.lastSyncedAt).filter((t): t is string => !!t)
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null
}

/** "Sync all": a row waiting for the person first, then the count; once ended, like a single sync */
function queueFace(queue: QueueView, info: SyncInfo | null, now: number, seenFailure: string | null): { tone: Tone; title: string; sub: string } | null {
  const label = (company: string) => info?.companies.find(c => c.id === company)?.label ?? ''
  const code = queue.items.filter(i => i.run?.status.state === 'needs-code')
  const links = queue.items.find(i => i.run?.status.state === 'needs-links')
  const finished = queue.items.filter(i => i.state !== 'waiting' && i.state !== 'running')
  if (!queue.finishedAt) {
    if (code.length) return { tone: 'attention', title: code.length > 1 ? `${code.length} קודים` : 'צריך קוד', sub: code.length > 1 ? 'SMS' : `SMS מ${label(code[0].company)}` }
    if (links) return { tone: 'attention', title: 'חשבון חדש', sub: label(links.company) }
    return { tone: 'busy', title: 'מסנכרן…', sub: `${finished.length} מתוך ${queue.items.length}` }
  }
  if (queue.items.some(i => i.state === 'failed' || i.state === 'skipped') && seenFailure !== queue.id) return { tone: 'failed', title: 'חלק נכשלו', sub: 'לפרטים' }
  if (now - new Date(queue.finishedAt).getTime() < DONE_SHOWN_MS) {
    const created = queue.items.reduce((n, i) => n + (i.created ?? 0), 0)
    return { tone: 'done', title: 'עודכן', sub: created ? `${created} חדשות` : 'אין חדשות' }
  }
  return null
}

function face(
  run: RunView | null,
  queue: QueueView | null,
  info: SyncInfo | null,
  now: number,
  seenFailure: string | null
): { tone: Tone; title: string; sub: string } {
  const fromQueue = queue && queueFace(queue, info, now, seenFailure)
  if (fromQueue) return fromQueue
  const label = run ? (info?.companies.find(c => c.id === run.company)?.label ?? '') : ''
  const s = run?.status
  if (s?.state === 'running') return { tone: 'busy', title: 'מסנכרן…', sub: `${label} · ${STEP_TEXT[s.step] ?? ''}` }
  if (s?.state === 'needs-code') return { tone: 'attention', title: 'צריך קוד', sub: `SMS מ${label}` }
  if (s?.state === 'needs-links') return { tone: 'attention', title: 'חשבון חדש', sub: label }
  if (s?.state === 'failed' && run && seenFailure !== run.id) return { tone: 'failed', title: 'נכשל', sub: 'לפרטים' }
  if (s?.state === 'done' && run?.finishedAt && now - new Date(run.finishedAt).getTime() < DONE_SHOWN_MS) {
    const created = s.results.reduce((n, r) => n + r.created, 0)
    return { tone: 'done', title: 'עודכן', sub: created ? `${created} חדשות` : 'אין חדשות' }
  }
  const last = lastSynced(info)
  return { tone: 'idle', title: 'סנכרון', sub: last ? timeAgo(last, now) : 'טרם סונכרן' }
}

const TONE_BOX: Record<Tone, string> = {
  idle: 'border-border bg-muted/70 text-foreground',
  busy: 'border-border bg-muted/70 text-foreground',
  attention: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  done: 'border-border bg-muted/70 text-foreground',
  failed: 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
}

function ToneIcon({ tone, attentionCode }: { tone: Tone; attentionCode: boolean }) {
  const c = 'h-4 w-4 shrink-0'
  if (tone === 'busy') return <Loader2 className={cn(c, 'animate-spin text-primary motion-reduce:animate-none')} aria-hidden />
  if (tone === 'attention') return attentionCode ? <Smartphone className={c} aria-hidden /> : <AlertCircle className={c} aria-hidden />
  if (tone === 'done') return <Check className={cn(c, 'text-emerald-600 dark:text-emerald-400')} strokeWidth={2.5} aria-hidden />
  if (tone === 'failed') return <AlertCircle className={c} aria-hidden />
  return <RefreshCw className={cn(c, 'text-muted-foreground')} aria-hidden />
}

/**
 * The header's sync button (ENG-91), at the start of the header opposite
 * search: "סנכרון" with the last sync under it on wider screens, the icon
 * alone on phones. It opens the sync panel: a dropdown under the button on
 * wider screens, a sheet from the bottom on phones (like "עוד"). The button
 * keeps its width in every state, so nothing in the header moves.
 */
export function SyncButton() {
  const sync = useSync()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [seenFailure, setSeenFailure] = useState<string | null>(null)
  const origin = useOpenOrigin()
  // Wider screens: the dropdown hangs under the button, its start edge on the button's
  const trigger = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<CSSProperties>({})

  // Ticks "לפני 3 דקות" along, and ends the "עודכן" moment
  useEffect(() => {
    const recent = sync.run?.status.state === 'done' || !!sync.queue?.finishedAt
    const id = setInterval(() => setNow(Date.now()), recent ? 1000 : 30_000)
    return () => clearInterval(id)
  }, [sync.run?.status.state, sync.queue?.finishedAt])

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      const r = trigger.current?.getBoundingClientRect()
      if (r) setAnchor({ '--sync-right': `${window.innerWidth - r.right}px`, '--sync-top': `${r.bottom + 8}px` } as CSSProperties)
      void sync.reload()
      if (sync.queue?.finishedAt) setSeenFailure(sync.queue.id)
      else if (sync.run?.status.state === 'failed') setSeenFailure(sync.run.id)
    }
  }

  const { tone, title, sub } = face(sync.run, sync.queue, sync.info, now, seenFailure)
  const needsCode = sync.run?.status.state === 'needs-code' || !!sync.queue?.items.some(i => i.run?.status.state === 'needs-code')

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        ref={trigger}
        aria-label={`${title}, ${sub}`}
        className={cn(
          'relative flex h-9 shrink-0 items-center gap-2.5 rounded-xl border text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'w-9 justify-center md:w-[10.5rem] md:justify-start md:px-3.5',
          // the 44px hit area around the 36px button
          'before:absolute before:-inset-1 before:content-[""]',
          'hover:bg-muted data-[state=open]:bg-card data-[state=open]:ring-2 data-[state=open]:ring-ring/30',
          TONE_BOX[tone]
        )}
      >
        <ToneIcon tone={tone} attentionCode={needsCode} />
        <span className="hidden min-w-0 flex-1 flex-col gap-[3px] md:flex">
          <span className="truncate text-[13px] font-semibold leading-[15px]">{title}</span>
          <span className={cn('truncate text-[11px] leading-[13px]', tone === 'idle' || tone === 'busy' || tone === 'done' ? 'text-muted-foreground' : 'opacity-80')}>
            {sub}
          </span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground md:block" aria-hidden />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-scrim fixed inset-0 z-40 bg-black/45 md:bg-transparent" />
        <Dialog.Content
          ref={origin}
          dir="rtl"
          aria-describedby={undefined}
          style={anchor}
          className={cn(
            'sheet sync-panel fixed z-50 overflow-hidden surface-overlay text-card-foreground focus:outline-none',
            // Phones: the "עוד" sheet's place, above the tab bar
            'inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-3xl',
            // Wider: a dropdown under the button, at the header's start
            'md:inset-x-auto md:bottom-auto md:left-auto md:right-[var(--sync-right,1rem)] md:top-[var(--sync-top,3.75rem)] md:max-h-[calc(100dvh-5rem)] md:w-[22rem] md:rounded-2xl'
          )}
        >
          <Dialog.Title className="sr-only">סנכרון</Dialog.Title>
          <div aria-hidden className="flex justify-center pt-2 md:hidden">
            <span className="h-1 w-9 rounded-full bg-border" />
          </div>
          <SyncPanel sync={sync} onClose={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
