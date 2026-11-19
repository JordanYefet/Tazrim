'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { SquareTerminal } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { setLogPrefs, useLogPrefs } from '@/components/logs/prefs'
import type { Detail } from '@/lib/log/view'

const DETAILS: { id: Detail; label: string }[] = [
  { id: 'errors', label: 'אזהרות ושגיאות' },
  { id: 'info', label: 'רגיל' },
  { id: 'debug', label: 'הכל' },
]

/** The switch the Settings pages use: the knob keeps its place, only its colour and side change */
function Toggle({ on, onChange, labelledBy, disabled }: { on: boolean; onChange: (next: boolean) => void; labelledBy: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="group -me-0.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-fast ease-ui group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background motion-reduce:transition-none',
          on ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span className={cn('absolute start-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-ui motion-reduce:transition-none', on && '-translate-x-4')} />
      </span>
    </button>
  )
}

function Row({ title, help, children, last }: { title: string; help: React.ReactNode; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn('flex items-center gap-5 p-4 md:px-6 md:py-5', !last && 'border-b')}>
      <div className="min-w-0 flex-1 space-y-1">{/* the title is its control's label (the id is set by the caller) */}
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground text-pretty">{help}</p>
      </div>
      {children}
    </div>
  )
}

/**
 * Settings → Debug (ENG-104). The window switch and the detail level are per device (this
 * browser's localStorage); "show the sync browser" is the server's, in memory, and off again
 * after a restart. In Docker the last one cannot work, so it is shown off and disabled, with why.
 */
export function DebugSettings({ inDocker, initialShowBrowser }: { inDocker: boolean; initialShowBrowser: boolean }) {
  const prefs = useLogPrefs()
  const [showBrowser, setShowBrowser] = useState(initialShowBrowser && !inDocker)
  const [error, setError] = useState<string | null>(null)
  const ids = { win: useId(), browser: useId() }

  async function toggleBrowser(next: boolean) {
    setError(null)
    setShowBrowser(next)
    const res = await fetch('/api/logs/browser', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show: next }),
    }).catch(() => null)
    if (!res?.ok) {
      setShowBrowser(!next)
      const data = await res?.json().catch(() => null)
      setError(data?.error ?? 'משהו השתבש. נסו שוב')
    }
  }

  return (
    <div className="space-y-4">
      <section aria-label="אפשרויות דיבאג" className="surface rounded-2xl">
        <div className="flex items-center gap-5 border-b p-4 md:px-6 md:py-5">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id={ids.win} className="text-base font-semibold">חלון לוגים</h2>
            <p className="text-sm text-muted-foreground text-pretty">חלון צף בפינה השמאלית התחתונה, בכל הדפים. נזכר אם השארתם אותו מכווץ.</p>
          </div>
          <Toggle on={prefs.on} onChange={on => setLogPrefs({ on })} labelledBy={ids.win} />
        </div>

        <Row title="רמת פירוט" help="מה נכנס לחלון.">
          <div role="group" aria-label="רמת פירוט" className="flex gap-1 rounded-[10px] bg-muted p-1">
            {DETAILS.map(d => (
              <button
                key={d.id}
                type="button"
                aria-pressed={prefs.detail === d.id}
                onClick={() => setLogPrefs({ detail: d.id })}
                className={cn(
                  'min-h-9 rounded-lg px-3.5 py-1.5 text-sm transition-colors duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  prefs.detail === d.id ? 'bg-card font-semibold text-foreground shadow-e1' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Row>

        <div className="flex items-center gap-5 p-4 md:px-6 md:py-5">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id={ids.browser} className={cn('text-base font-semibold', inDocker && 'text-muted-foreground')}>להציג את דפדפן הסנכרון</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              עובד רק בפיתוח, ב-<bdi dir="ltr" className="font-mono text-[0.8125rem]">npm run dev</bdi> על המחשב. ב-<bdi dir="ltr">Docker</bdi> הדפדפן רץ בלי מסך. חוזר לכבוי בכל הפעלה של השרת.
            </p>
            <p className={cn('min-h-5 text-[0.8125rem]', error ? 'text-destructive dark:text-red-400' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
              {error ?? (inDocker ? <>האפליקציה רצה כאן ב-<bdi dir="ltr">Docker</bdi>, ולכן המתג כבוי.</> : '')}
            </p>
          </div>
          <Toggle on={showBrowser} onChange={toggleBrowser} labelledBy={ids.browser} disabled={inDocker} />
        </div>
      </section>

      <p className="max-w-[45rem] text-[0.8125rem] leading-relaxed text-muted-foreground text-pretty">
        פרטי כניסה, מספרי זהות, מספרי חשבון וכרטיס, סכומים ותיאורי תנועות לא מגיעים לחלון אף פעם. הם מוסתרים לפני שהשורה נכתבת.
      </p>

      <Link
        href="/logs"
        className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-quick hover:bg-primary/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <SquareTerminal aria-hidden className="h-4 w-4" />
        פתיחת עמוד הלוגים
      </Link>
    </div>
  )
}
