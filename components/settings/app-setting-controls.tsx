'use client'

import { createContext, useContext, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { inputClass } from '@/components/accounts/add-account-form'
import { secondaryButton } from '@/components/auth/ui'
import { cn } from '@/lib/utils/cn'
import type { SettingName } from '@/lib/settings/app-settings'

/** Saves one app setting (ENG-120); throws the server's Hebrew message on a refusal */
export async function saveAppSetting(name: SettingName, value: string | number | boolean | null): Promise<void> {
  const res = await fetch('/api/settings/app', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'משהו השתבש. נסו שוב')
  }
}

/** Runs a save and keeps its busy flag and error line; the error line always has its room */
export function useSave() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(name: SettingName, value: string | number | boolean | null, onDone?: () => void): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await saveAppSetting(name, value)
      onDone?.()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const Plain = createContext(false)

/**
 * Inside another card (a step of the first run, ENG-125): the setting cards below
 * lose their own surface and sit as sections split by a hairline, so there is no
 * card inside a card.
 */
export function PlainSettingCards({ children }: { children: React.ReactNode }) {
  return <Plain.Provider value>{children}</Plain.Provider>
}

/** A card for one setting: its title and explanation, the control, and one line under it that is always there */
export function SettingCard({
  title,
  help,
  locked,
  error,
  children,
}: {
  title: string
  help: React.ReactNode
  locked: boolean
  error?: string | null
  children: React.ReactNode
}) {
  const plain = useContext(Plain)
  return (
    <section className={plain ? 'space-y-3 border-t pt-4 first:border-t-0 first:pt-0' : 'space-y-3 rounded-2xl surface p-4 md:p-5'}>
      <div className="space-y-1">
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground text-pretty">{help}</p>
      </div>
      {children}
      <p className={cn('min-h-5 text-[0.8125rem]', error ? 'text-destructive dark:text-red-400' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
        {error ?? (locked ? 'נקבע בקובץ .env, ולכן אי אפשר לשנות כאן.' : '')}
      </p>
    </section>
  )
}

/** A select that saves when picked */
export function SelectSetting({
  name,
  value,
  options,
  locked,
  label,
  onSaved,
  title,
  help,
}: {
  name: SettingName
  value: string
  options: { value: string; label: string }[]
  locked: boolean
  label: string
  onSaved?: (v: string) => void
  title: string
  help: React.ReactNode
}) {
  const [current, setCurrent] = useState(value)
  const { busy, error, run } = useSave()
  const shown = options.some(o => o.value === current) ? options : [...options, { value: current, label: current }]
  return (
    <SettingCard title={title} help={help} locked={locked} error={error}>
      <div className="flex items-center gap-2">
        <select
          aria-label={label}
          className={cn(inputClass, 'sm:max-w-xs')}
          dir="auto"
          value={current}
          disabled={locked || busy}
          onChange={async e => {
            const next = e.target.value
            const prev = current
            setCurrent(next)
            if (await run(name, next)) onSaved?.(next)
            else setCurrent(prev)
          }}
        >
          {shown.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Loader2 className={cn('h-4 w-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none', !busy && 'invisible')} aria-hidden />
      </div>
    </SettingCard>
  )
}

/** A text field with a save button (enabled once it differs from what is saved) */
export function TextSetting({
  name,
  value,
  locked,
  label,
  placeholder,
  title,
  help,
}: {
  name: SettingName
  value: string
  locked: boolean
  label: string
  placeholder: string
  title: string
  help: React.ReactNode
}) {
  const [saved, setSaved] = useState(value)
  const [draft, setDraft] = useState(value)
  const { busy, error, run } = useSave()
  const dirty = draft.trim() !== saved
  async function save(e: React.FormEvent) {
    e.preventDefault()
    const next = draft.trim()
    if (await run(name, next === '' ? null : next)) {
      // Show the cleaned list the server keeps (lower case, no trailing slashes)
      const clean = next.split(',').map(s => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean).join(', ')
      setSaved(clean)
      setDraft(clean)
    }
  }
  return (
    <SettingCard title={title} help={help} locked={locked} error={error}>
      <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
        <input
          aria-label={label}
          className={cn(inputClass, 'min-w-0 sm:flex-1')}
          dir="ltr"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={draft}
          disabled={locked || busy}
          onChange={e => setDraft(e.target.value)}
        />
        <button type="submit" disabled={locked || busy || !dirty} className={cn(secondaryButton, 'w-full sm:w-auto')}>
          שמירה
        </button>
      </form>
    </SettingCard>
  )
}

/** A switch that saves when flipped; the knob keeps its place, only its colour and side change */
export function SwitchSetting({
  name,
  value,
  locked,
  title,
  help,
  switchLabel,
}: {
  name: SettingName
  value: boolean
  locked: boolean
  title: string
  help: React.ReactNode
  switchLabel: string
}) {
  const [on, setOn] = useState(value)
  const { busy, error, run } = useSave()
  const off = locked || busy
  return (
    <SettingCard title={title} help={help} locked={locked} error={error}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id={`sw-${name}`} className="text-sm">{switchLabel}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`sw-${name}`}
          disabled={off}
          onClick={async () => {
            const next = !on
            setOn(next)
            if (!(await run(name, next))) setOn(!next)
          }}
          className="group -me-0.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-50"
        >
          <span
            aria-hidden
            className={cn(
              'relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-fast ease-ui group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
              on ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span className={cn('absolute start-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-ui motion-reduce:transition-none', on && '-translate-x-4')} />
          </span>
        </button>
      </div>
    </SettingCard>
  )
}
