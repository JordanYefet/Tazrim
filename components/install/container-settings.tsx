'use client'

/**
 * Container-level settings from the app (ENG-121): the hook and the controls every page with
 * such a setting uses (/settings/network, and the setup steps that show part of it).
 *
 *   const settings = useContainerSettings(initialView)   // initialView from getInstallView()
 *   <ContainerSettingField settings={settings} name="TAZRIM_PORT" label="…" />
 *   <ContainerProfileSwitch settings={settings} profile="https" label="…" />
 *   <ContainerApplyStatus settings={settings} />
 *
 * With the helper, a change is saved to .env and applied (Tazrim restarts, and when the port the
 * browser is on changes, the browser moves to the new address). Without it, each control shows
 * the .env line and the command, behind "הצגת שלבים ידניים" (one per section where a section has
 * several controls: `manual={false}` on each, and one <ManualEnvSteps> with all their lines).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { parseProfiles, validateChanges } from '@/updater/env-file.mjs'
import { INSTALL_MESSAGES, INVALID_VALUE_BY_KEY } from '@/lib/install/messages'
import type { ConfigChanges, ConfigKey, ConfigValues, InstallView, Profile } from '@/lib/install/types'
import { CopyLine, Disclosure } from '@/components/install/guide'

/** The command that applies .env by hand, in the Tazrim folder */
export const MANUAL_APPLY_COMMAND = 'docker compose up -d'

const POLL_MS = 1500
const GIVE_UP_MS = 4 * 60 * 1000
/** A finished change is still worth a line on the page for this long (e.g. after moving to the new port) */
const RECENT_MS = 2 * 60 * 1000

export type ApplyPhase = 'idle' | 'saving' | 'applying' | 'moving' | 'done' | 'failed'

export interface ContainerSettings {
  view: InstallView
  /** What compose uses now */
  values: ConfigValues
  /** The helper can apply changes; otherwise the controls show manual steps */
  canApply: boolean
  phase: ApplyPhase
  /** A change is being saved or applied: controls stay where they are, disabled */
  busy: boolean
  /** The keys of the change in flight (or the last one) */
  changingKeys: ConfigKey[]
  /** A Hebrew line for ContainerApplyStatus, or null */
  message: string | null
  /** The control a refusal is about, for its own error line */
  errorKey: ConfigKey | null
  /** Saves and applies; resolves true when it worked (or the browser is moving to the new address) */
  apply: (changes: ConfigChanges) => Promise<boolean>
  refresh: () => Promise<void>
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Does anything answer at `origin`? An opaque (no-cors) answer is enough; the app sends no CORS headers */
async function answers(origin: string): Promise<boolean> {
  try {
    await fetch(`${origin}/api/health`, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

async function fetchView(): Promise<InstallView | null> {
  try {
    const res = await fetch('/api/install', { cache: 'no-store', signal: AbortSignal.timeout(4000) })
    return res.ok ? ((await res.json()) as InstallView) : null
  } catch {
    return null
  }
}

/** Where this page will be after the change: the same address, unless the port it is on moves */
export function nextOrigin(href: string, before: ConfigValues, after: ConfigValues): string {
  const u = new URL(href)
  const port = u.port || (u.protocol === 'https:' ? '443' : '80')
  for (const key of ['TAZRIM_PORT', 'TAZRIM_PHONE_PORT'] as const) {
    if (port === before[key] && after[key] !== before[key]) {
      u.port = after[key]
      return u.origin
    }
  }
  return u.origin
}

const jobMessage = (code: string | undefined) => INSTALL_MESSAGES[code ?? 'APPLY_FAILED'] ?? INSTALL_MESSAGES.APPLY_FAILED

export function useContainerSettings(initial: InstallView): ContainerSettings {
  const [view, setView] = useState(initial)
  const [phase, setPhase] = useState<ApplyPhase>(() => {
    const j = initial.job
    if (j?.state === 'running') return 'applying'
    const recent = j?.finishedAt && Date.now() - Date.parse(j.finishedAt) < RECENT_MS
    return recent ? (j.state === 'done' ? 'done' : 'failed') : 'idle'
  })
  const [message, setMessage] = useState<string | null>(() =>
    initial.job?.state === 'failed' && initial.job.finishedAt && Date.now() - Date.parse(initial.job.finishedAt) < RECENT_MS ? jobMessage(initial.job.code) : null
  )
  const [errorKey, setErrorKey] = useState<ConfigKey | null>(null)
  const [changingKeys, setChangingKeys] = useState<ConfigKey[]>(initial.job?.keys ?? [])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const v = await fetchView()
    if (v && alive.current) setView(v)
  }, [])

  /** Waits for job `jobId` to finish; moves the browser when its port changed */
  const follow = useCallback(async (jobId: string | null, target: string | null): Promise<boolean> => {
    const deadline = Date.now() + GIVE_UP_MS
    while (alive.current && Date.now() < deadline) {
      await sleep(POLL_MS)
      if (target && (await answers(target))) {
        setPhase('moving')
        setMessage(null)
        window.location.assign(target + window.location.pathname + window.location.search)
        return true
      }
      const v = await fetchView()
      if (!v || !alive.current) continue
      const j = v.job
      if (!j || (jobId && j.id !== jobId) || j.state === 'running') continue
      setView(v)
      if (j.state === 'done') {
        // Done but the browser's port moved: the new address is about to answer
        if (target) continue
        setPhase('done')
        setMessage(null)
        return true
      }
      setPhase('failed')
      setMessage(jobMessage(j.code))
      return false
    }
    if (alive.current) {
      setPhase('failed')
      setMessage(INSTALL_MESSAGES.TIMEOUT)
    }
    return false
  }, [])

  // Opened while a change runs (another tab, or a reload): follow it
  useEffect(() => {
    if (initial.job?.state === 'running') void follow(initial.job.id, null)
  }, [initial.job, follow])

  const apply = useCallback(
    async (changes: ConfigChanges): Promise<boolean> => {
      setErrorKey(null)
      setMessage(null)
      const keys = Object.keys(changes) as ConfigKey[]
      setChangingKeys(keys)
      const v = validateChanges(changes, view.fileValues ?? view.values)
      if (!v.ok) {
        setPhase('failed')
        setErrorKey((v.key as ConfigKey) ?? null)
        setMessage((v.code === 'INVALID_VALUE' && v.key && INVALID_VALUE_BY_KEY[v.key]) || INSTALL_MESSAGES[v.code] || INSTALL_MESSAGES.INVALID_VALUE)
        return false
      }
      const after = { ...view.values }
      for (const [k, val] of Object.entries(v.changes) as [ConfigKey, string | null][]) after[k] = val ?? ''
      const target = nextOrigin(window.location.href, view.values, { ...after, TAZRIM_PORT: after.TAZRIM_PORT || '3000', TAZRIM_PHONE_PORT: after.TAZRIM_PHONE_PORT || '3001' })
      const moving = target !== window.location.origin ? target : null

      setPhase('saving')
      // Something already answers on the new port: it's taken, and moving there would open it
      if (moving && (await answers(moving))) {
        setPhase('failed')
        setErrorKey(keys.find(k => k === 'TAZRIM_PORT' || k === 'TAZRIM_PHONE_PORT') ?? null)
        setMessage('הפורט תפוס בתוכנה אחרת במחשב. בוחרים פורט אחר')
        return false
      }
      let jobId: string | null = null
      try {
        const res = await fetch('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: v.changes }),
        })
        const j = (await res.json().catch(() => null)) as { job?: { id?: string } | null; error?: string; key?: ConfigKey } | null
        if (res.status !== 202) {
          setPhase('failed')
          setErrorKey(j?.key ?? null)
          setMessage(j?.error ?? INSTALL_MESSAGES.HELPER_ERROR)
          return false
        }
        jobId = j?.job?.id ?? null
      } catch {
        setPhase('failed')
        setMessage(INSTALL_MESSAGES.HELPER_ERROR)
        return false
      }
      setPhase('applying')
      return follow(jobId, moving)
    },
    [view, follow]
  )

  const busy = phase === 'saving' || phase === 'applying' || phase === 'moving'
  return { view, values: view.values, canApply: view.helper === 'ready', phase, busy, changingKeys, message, errorKey, apply, refresh }
}

const STATUS: Partial<Record<ApplyPhase, string>> = {
  saving: 'שומרים…',
  applying: 'מחילים את השינוי. תזרים מופעל מחדש, זה לוקח כחצי דקה',
  moving: 'עוברים לכתובת החדשה…',
  done: 'השינוי נשמר והופעל',
}

/**
 * One line under the controls: what the change is doing, or why it failed. Its height is kept.
 * `only`: on a page with several sections, the line under a section speaks only of its own keys.
 */
export function ContainerApplyStatus({ settings, className, only }: { settings: ContainerSettings; className?: string; only?: ConfigKey[] }) {
  const { phase, message, errorKey } = settings
  const mine = !only || settings.changingKeys.some(k => only.includes(k))
  const busy = settings.busy && mine
  // A refusal about one field shows under that field instead
  const text = !mine ? '' : phase === 'failed' ? (errorKey ? '' : message) : (STATUS[phase] ?? '')
  return (
    <p aria-live="polite" className={cn('flex min-h-5 items-center gap-1.5 text-xs', phase === 'failed' ? 'text-destructive' : 'text-muted-foreground', className)}>
      {busy && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
      {text}
    </p>
  )
}

/** The manual way: the .env lines, then the command, in the Tazrim folder. Behind "הצגת שלבים ידניים". */
export function ManualEnvSteps({ lines, installDir, className }: { lines: string[]; installDir?: string | null; className?: string }) {
  return (
    <Disclosure label="הצגת שלבים ידניים" className={className}>
      <div className="mt-1 space-y-2 rounded-xl bg-muted/60 p-3">
        <p className="text-sm text-muted-foreground">
          בקובץ <bdi dir="ltr">.env</bdi> שבתיקייה של תזרים
          {installDir ? (
            <>
              {' '}(<bdi dir="ltr" className="font-mono">{installDir}</bdi>)
            </>
          ) : null}
          , משנים או מוסיפים:
        </p>
        <CopyLine text={lines.join('\n')} className="bg-background" />
        <p className="text-sm text-muted-foreground">ואז, באותה תיקייה:</p>
        <CopyLine text={MANUAL_APPLY_COMMAND} className="bg-background" />
      </div>
    </Disclosure>
  )
}

const INPUT =
  'h-10 w-full rounded-lg border bg-background px-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
const SAVE =
  'relative inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'

/**
 * A text setting (port, address, host name): the field and a save button; without the helper,
 * the field still edits and the manual steps show its line. Errors about it show under it.
 */
export function ContainerSettingField({
  settings,
  name,
  label,
  hint,
  placeholder,
  inputMode = 'text',
  manual = true,
  onDraftChange,
}: {
  settings: ContainerSettings
  name: Exclude<ConfigKey, 'COMPOSE_PROFILES'>
  label: string
  hint?: React.ReactNode
  placeholder?: string
  inputMode?: 'numeric' | 'decimal' | 'text' | 'url'
  /** Its own manual steps without the helper; false where the section shows one set for all */
  manual?: boolean
  /** The value being typed, for a section's one set of manual steps */
  onDraftChange?: (draft: string) => void
}) {
  const value = settings.values[name]
  const [draft, setDraftState] = useState(value)
  const setDraft = (v: string) => {
    setDraftState(v)
    onDraftChange?.(v.trim())
  }
  const dirty = draft.trim() !== value
  // A saved (or restored) value replaces an untouched field
  const last = useRef(value)
  useEffect(() => {
    if (last.current !== value) {
      setDraft(value)
      last.current = value
    }
  }, [value])

  const id = `container-setting-${name}`
  const mine = settings.errorKey === name
  const saving = settings.busy && settings.changingKeys.includes(name)

  return (
    <form
      className="space-y-1.5"
      onSubmit={e => {
        e.preventDefault()
        if (settings.canApply && dirty && !settings.busy) void settings.apply({ [name]: draft.trim() })
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          dir="ltr"
          className={cn(INPUT, mine && 'border-destructive')}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={settings.busy}
          aria-invalid={mine || undefined}
          aria-describedby={`${id}-note`}
        />
        {settings.canApply && (
          <button type="submit" className={SAVE} disabled={!dirty || settings.busy} aria-busy={saving || undefined}>
            <span className={cn(saving && 'invisible')}>שמירה</span>
            {saving && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          </button>
        )}
      </div>
      <p id={`${id}-note`} className={cn('min-h-5 text-xs', mine ? 'text-destructive' : 'text-muted-foreground')}>
        {mine ? settings.message : hint}
      </p>
      {manual && !settings.canApply && <ManualEnvSteps lines={[`${name}=${draft.trim()}`]} installDir={settings.view.installDir} />}
    </form>
  )
}

/** The on/off switch itself (44px target), as in the profile switches below */
export function SwitchButton({
  on,
  labelledBy,
  busy,
  disabled,
  onClick,
}: {
  on: boolean
  labelledBy: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onClick}
      className="group -my-2.5 -me-0.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none disabled:opacity-60"
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-150 ease-ui group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
          on ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span
          className={cn(
            'absolute start-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-ui motion-reduce:transition-none',
            // RTL: "on" moves the knob toward the end (left)
            on && '-translate-x-4'
          )}
        />
      </span>
    </button>
  )
}

/** On/off for a compose profile (HTTPS, local names). The updater's own profile is never offered. */
export function ContainerProfileSwitch({
  settings,
  profile,
  label,
  description,
}: {
  settings: ContainerSettings
  profile: Exclude<Profile, 'updater'>
  label: string
  description?: React.ReactNode
}) {
  const current = parseProfiles(settings.values.COMPOSE_PROFILES) ?? []
  const on = current.includes(profile)
  const toggled = on ? current.filter(p => p !== profile) : [...current, profile]
  // With the helper running, its own profile is on whatever the file says
  const next = (parseProfiles((settings.canApply ? ['updater', ...toggled] : toggled).join(',')) ?? []).join(',')
  const id = `container-profile-${profile}`
  const saving = settings.busy && settings.changingKeys.includes('COMPOSE_PROFILES')

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="space-y-0.5">
          <span id={`${id}-label`} className="block text-sm font-medium">
            {label}
          </span>
          {description && <span className="block text-xs text-muted-foreground">{description}</span>}
        </span>
        <SwitchButton
          on={on}
          labelledBy={`${id}-label`}
          busy={saving}
          disabled={!settings.canApply || settings.busy}
          onClick={() => void settings.apply({ COMPOSE_PROFILES: next })}
        />
      </div>
      {!settings.canApply && <ManualEnvSteps lines={[`COMPOSE_PROFILES=${next}`]} installDir={settings.view.installDir} />}
    </div>
  )
}
