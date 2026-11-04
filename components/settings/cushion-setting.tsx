// components/settings/cushion-setting.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/** The projection's safety cushion (ENG-87): months whose low edge dips under it are flagged. */
export function CushionSetting({ initial }: { initial: number }) {
  const [value, setValue] = useState(String(initial))
  const [saved, setSaved] = useState(String(initial))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState('')

  async function save() {
    if (value === saved) return
    setState('saving')
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cushion: value }),
    }).catch(() => null)
    const body = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) {
      setSaved(String(body.cushion))
      setValue(String(body.cushion))
      setState('saved')
    } else {
      setError(body.error ?? 'השמירה נכשלה')
      setState('error')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl surface p-4 md:p-6">
      <div className="min-w-0">
        <label htmlFor="cushion" className="text-sm font-medium">כרית ביטחון</label>
        <p className="text-sm text-muted-foreground">חודש שבו היתרה עלולה לרדת מתחת לסכום הזה יסומן בתחזית</p>
        {/* Reserved line: the row keeps its height whether or not there's a message */}
        <p role="status" className={cn('min-h-5 text-xs', state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
          {state === 'error' ? error : state === 'saved' ? 'נשמר' : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground" aria-hidden>₪</span>
        <input
          id="cushion"
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={e => { setValue(e.target.value); setState('idle') }}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-invalid={state === 'error' || undefined}
          className="h-9 w-32 rounded-lg border border-border bg-muted px-3 text-end text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
        />
      </div>
    </div>
  )
}
