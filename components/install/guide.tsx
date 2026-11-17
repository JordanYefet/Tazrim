'use client'

/**
 * The pieces of Settings → Phones and network (and the setup steps that show it): short how-to
 * guides as rows, each opening in the app's window (AppDialog), so the page itself stays short and
 * nothing on it moves; an address with its copy button; QR codes; a disclosure. Each guide fits on
 * a laptop screen without scrolling.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, Copy, QrCode, type LucideIcon } from 'lucide-react'
import QRCode from 'qrcode'
import { AppDialog } from '@/components/ui/app-dialog'
import { cn } from '@/lib/utils/cn'
import { TEXT_BUTTON } from '@/components/updates/manual-commands'

export interface GuideItem {
  id: string
  title: string
  summary: string
  icon: LucideIcon
  body: React.ReactNode
}

export interface GuideGroup {
  title: string
  guides: GuideItem[]
}

/**
 * A section's own surface on a Settings page; inside /setup's card (`plain`) a section split by a
 * hairline instead, so there is no card inside a card (as SettingCard does, ENG-125)
 */
export function sectionClass(plain: boolean) {
  return plain ? 'border-t pt-4 first:border-t-0 first:pt-0' : 'rounded-2xl surface p-5'
}

/** A section's heading on the phones and network page; the anchor (#phones…) lands a little above it */
export function SectionHeading({ id, children, line }: { id: string; children: React.ReactNode; line?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-base font-semibold">
        {children}
      </h2>
      {line && <p className="text-sm text-muted-foreground text-pretty">{line}</p>}
    </div>
  )
}

/**
 * An address on one line where it fits; when it can't, it breaks only after "://" or before the
 * port, never inside a number or a name.
 */
export function Address({ url, className }: { url: string; className?: string }) {
  const parts = url.split(/(?<=:\/\/)|(?=:\d+$)/)
  return (
    <p dir="ltr" className={cn('text-end font-mono font-semibold tabular-nums tracking-tight [overflow-wrap:normal] [word-break:keep-all]', className)}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <wbr />}
          <span className="whitespace-nowrap">{p}</span>
        </span>
      ))}
    </p>
  )
}

/** Copies `text`; on plain http (no clipboard API) through a hidden field, as browsers still allow */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the old way
  }
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  field.remove()
  return ok
}

/** A copy button: the copy icon turns to a check for a moment (a short blur cross-fade), then back */
export function CopyButton({ text, label = 'העתקה', className, disabled }: { text: string; label?: string; className?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    if (!(await copyText(text))) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-[color,background-color,transform] duration-[120ms] ease-out hover-fine:bg-muted hover-fine:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
        className
      )}
    >
      <Copy className="copy-icon col-start-1 row-start-1 h-[18px] w-[18px]" data-hidden={copied || undefined} aria-hidden />
      <Check className="copy-icon col-start-1 row-start-1 h-[18px] w-[18px] text-primary" data-hidden={!copied || undefined} aria-hidden />
      <span className="sr-only" aria-live="polite">
        {copied ? 'הועתק' : ''}
      </span>
    </button>
  )
}

/** An address with its copy button beside it: the phone address, the HTTPS address */
export function AddressLine({ url, className, disabled }: { url: string; className?: string; disabled?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Address url={url} className={cn('min-w-0', className)} />
      <CopyButton text={url} label="העתקת הכתובת" disabled={disabled} />
    </div>
  )
}

/** Opens and closes its content: the height through the grid row, with opacity; the chevron turns */
export function Disclosure({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="-ms-3 inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary transition-[color,background-color,transform] duration-[120ms] ease-out hover-fine:bg-primary/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <ChevronDown className="disclosure-chevron h-4 w-4" aria-hidden />
      </button>
      <div className="disclosure" data-open={open || undefined}>
        {/* Closed, its content is out of reach for the keyboard and screen readers */}
        <div inert={!open || undefined} aria-hidden={!open || undefined}>
          {children}
        </div>
      </div>
    </div>
  )
}

/** A guide's row: icon, title, one line, chevron. Pressing opens its window. */
function GuideRow({ g, onOpen }: { g: GuideItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(g.id)}
      className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-muted/60 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <g.icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-sm font-medium">{g.title}</span>
        <span className="block text-xs text-muted-foreground text-pretty">{g.summary}</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden />
    </button>
  )
}

/** The window a guide opens in; one for the whole list */
export function GuideWindow({ guides, open, onClose }: { guides: GuideItem[]; open: string | null; onClose: () => void }) {
  const current = guides.find(g => g.id === open)
  return (
    <AppDialog open={!!current} onOpenChange={o => !o && onClose()} title={current?.title ?? ''}>
      <div className="mt-3 space-y-3 text-sm leading-relaxed">{current?.body}</div>
    </AppDialog>
  )
}

/** Which guide is open; `?guide=reserve` (older links, the HTTPS section) opens one, once */
export function useOpenGuide(guides: GuideItem[]) {
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('guide')
    if (id && guides.some(g => g.id === id)) setOpen(id)
    // Only the first time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return [open, setOpen] as const
}

/**
 * The guides as rows, in short groups under one heading (`title`), or one plain group. The window
 * is the caller's (GuideWindow), so a link elsewhere on the page can open a guide too.
 */
export function GuideList({
  title,
  groups,
  onOpen,
  plain = false,
  id,
}: {
  title?: string
  groups: GuideGroup[]
  onOpen: (id: string) => void
  plain?: boolean
  id?: string
}) {
  return (
    <section id={id} aria-label={title ?? groups[0]?.title} className={cn('scroll-mt-6', sectionClass(plain))}>
      {title && <h2 className="pb-2 text-base font-semibold">{title}</h2>}
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group.title}>
            {(title || groups.length > 1) && <h3 className="pb-1 text-xs font-medium text-muted-foreground">{group.title}</h3>}
            <ul className="divide-y">
              {group.guides.map(g => (
                <li key={g.id}>
                  <GuideRow g={g} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Numbered steps */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-1.5 ps-5 marker:text-muted-foreground [&>li]:ps-1 [&>li]:text-pretty">{children}</ol>
}

/** A quieter line under the steps */
export function Note({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warn' }) {
  return <p className={cn('text-pretty text-[13px]', tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{children}</p>
}

/** A menu path or a name as the device shows it: kept left-to-right where it's English */
export function Ui({ children, ltr }: { children: React.ReactNode; ltr?: boolean }) {
  return (
    <bdi dir={ltr ? 'ltr' : undefined} className="font-medium">
      {children}
    </bdi>
  )
}

/** A value to type or copy (an address, a command): selectable, with a copy button */
export function CopyLine({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn('flex items-center justify-between gap-2 rounded-lg bg-muted py-0.5 pe-0.5 ps-3', className)}>
      <span dir="ltr" className="min-w-0 select-all whitespace-pre-wrap break-all font-mono text-[13px]">
        {text}
      </span>
      <CopyButton text={text} className="h-9 w-9" />
    </span>
  )
}

/** A QR code for `url`, drawn here (no service). Keeps its square while drawing. */
export function QrImage({ url, size = 148, label }: { url: string | null; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!url) {
      setSrc(null)
      return
    }
    QRCode.toDataURL(url, { margin: 1, width: size * 2 })
      .then(s => alive && setSrc(s))
      .catch(() => alive && setSrc(null))
    return () => {
      alive = false
    }
  }, [url, size])
  return (
    <span
      key={src ? 'code' : 'empty'}
      className={cn('flex shrink-0 items-center justify-center rounded-xl p-2', src ? 'pop-in bg-white ring-1 ring-black/5' : 'border border-dashed bg-muted/40 text-muted-foreground/40')}
      style={{ width: size + 16, height: size + 16 }}
    >
      {src ? <img src={src} alt={label} width={size} height={size} className="block" /> : <QrCode className="h-8 w-8" aria-hidden />}
    </span>
  )
}

/** While /setup loads a page's data (the Settings pages pass it in): a quiet card, or a retry */
export function InstallLoading({ failed, retry, plain = false }: { failed: boolean; retry: () => void; plain?: boolean }) {
  return (
    <div className={cn('flex min-h-48 items-center justify-center text-sm text-muted-foreground', !plain && 'rounded-2xl surface p-5')}>
      {failed ? (
        <span className="flex flex-col items-center gap-1">
          לא הצלחנו לטעון את ההגדרות.
          <button type="button" onClick={retry} className={TEXT_BUTTON}>
            ניסיון נוסף
          </button>
        </span>
      ) : (
        <span aria-live="polite">טוען…</span>
      )}
    </div>
  )
}
