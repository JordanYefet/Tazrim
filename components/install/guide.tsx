'use client'

/**
 * Short how-to guides for the phones and HTTPS pages (ENG-122/123): a list of rows, each opening
 * its guide in the app's window (AppDialog), so the page itself stays short and nothing on it
 * moves. Each guide fits on a laptop screen without scrolling.
 */
import { useEffect, useState } from 'react'
import { ChevronLeft, type LucideIcon } from 'lucide-react'
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

/**
 * The guides as rows in one card. `openId` opens one from outside (a link like
 * /settings/phones?guide=reserve); it is read once.
 */
export function GuideList({ title, guides, openId }: { title: string; guides: GuideItem[]; openId?: string | null }) {
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (openId && guides.some(g => g.id === openId)) setOpen(openId)
    // Only the first time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])
  const current = guides.find(g => g.id === open)
  return (
    <section aria-label={title} className="rounded-xl surface">
      <h2 className="px-5 pb-1 pt-4 text-base font-semibold">{title}</h2>
      <ul className="divide-y">
        {guides.map(g => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => setOpen(g.id)}
              className="flex min-h-14 w-full items-center gap-3 px-5 py-3 text-start transition-colors duration-quick hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
          </li>
        ))}
      </ul>
      <AppDialog open={!!current} onOpenChange={o => !o && setOpen(null)} title={current?.title ?? ''}>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">{current?.body}</div>
      </AppDialog>
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
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (plain http): the text is selectable
    }
  }
  return (
    <span className={cn('flex items-center justify-between gap-2 rounded-lg bg-muted py-0.5 pe-0.5 ps-3', className)}>
      <span dir="ltr" className="min-w-0 select-all break-all font-mono text-[13px]">
        {text}
      </span>
      <button type="button" onClick={copy} className={cn(TEXT_BUTTON, 'min-h-9 shrink-0')}>
        {copied ? 'הועתק' : 'העתקה'}
      </button>
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
    <span className="block shrink-0 rounded-xl bg-white p-2" style={{ width: size + 16, height: size + 16 }}>
      {src && <img src={src} alt={label} width={size} height={size} className="block" />}
    </span>
  )
}

/** While /setup loads a page's data (the Settings pages pass it in): a quiet card, or a retry */
export function InstallLoading({ failed, retry }: { failed: boolean; retry: () => void }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl surface p-5 text-sm text-muted-foreground">
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
