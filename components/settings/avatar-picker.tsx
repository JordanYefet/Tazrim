'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { AppDialog } from '@/components/ui/app-dialog'
import { prefersReducedMotion } from '@/lib/a11y/media'
import { artHasBackground, artUri } from '@/components/avatar/person-avatar'
import {
  AVATAR_SETS,
  INK,
  PASTEL,
  SEEDS,
  TEXT_MAX,
  avatarFontSize,
  avatarLines,
  nameInitial,
  type Avatar,
  type AvatarSet,
} from '@/lib/avatar/options'

const RING = 'ring-2 ring-offset-2 ring-offset-card ring-transparent transition-[box-shadow,transform,background-color] duration-fast ease-ui motion-reduce:transition-none'
const PRESS = 'active:scale-[0.94] transition-transform duration-quick ease-ui motion-reduce:transition-none'

interface Draft {
  mode: 'art' | 'text'
  set: AvatarSet
  seed: string
  bg: number
  ink: number
  text: string
}

function initialDraft(avatar: Avatar | null, name: string): Draft {
  const d: Draft = { mode: 'art', set: 'notionists', seed: SEEDS[0], bg: 0, ink: 0, text: nameInitial(name) }
  if (avatar?.kind === 'art') return { ...d, set: avatar.set, seed: avatar.seed, bg: avatar.bg }
  if (avatar?.kind === 'text') return { ...d, mode: 'text', text: avatar.text, ink: avatar.ink, bg: avatar.bg }
  return d
}

const toAvatar = (d: Draft): Avatar =>
  d.mode === 'art' ? { kind: 'art', set: d.set, seed: d.seed, bg: d.bg } : { kind: 'text', text: d.text.trim(), ink: d.ink, bg: d.bg }

/** The face, popping in whenever it changes (the key), on a background that eases */
function Preview({ draft }: { draft: Draft }) {
  const art = draft.mode === 'art'
  const text = draft.text.trim() || nameInitial('')
  const key = art ? `${draft.set}:${draft.seed}` : `${draft.ink}:${draft.text}`
  const plain = art && !artHasBackground(draft.set)
  return (
    <div
      className="relative h-[84px] w-[84px] overflow-hidden rounded-[30%] transition-colors duration-fast ease-ui motion-reduce:transition-none"
      style={{ backgroundColor: plain ? 'transparent' : PASTEL[draft.bg] }}
    >
      <div
        key={key}
        className="face-in absolute inset-0 flex flex-col items-center justify-center whitespace-nowrap font-bold leading-[1.05]"
        style={art ? undefined : { color: INK[draft.ink], fontSize: avatarFontSize(text, 84) }}
      >
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artUri(draft.set, draft.seed)} alt="" draggable={false} className="h-full w-full" />
        ) : (
          avatarLines(text).map((l, i) => <span key={i}>{l}</span>)
        )}
      </div>
    </div>
  )
}

function PickerBody({ avatar, name, onClose, onSaved }: { avatar: Avatar | null; name: string; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState(() => initialDraft(avatar, name))
  const [page, setPage] = useState(() => Math.max(0, AVATAR_SETS.indexOf(initialDraft(avatar, name).set)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pages = useRef<HTMLDivElement>(null)
  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))

  // Opens on the set of the current avatar; the dialog is right-to-left, so pages sit at negative offsets
  useEffect(() => {
    const el = pages.current
    if (el) el.scrollTo({ left: -page * el.clientWidth, behavior: 'instant' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The dots follow the page that is most in view
  useEffect(() => {
    const el = pages.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) if (e.intersectionRatio >= 0.6) setPage(Number((e.target as HTMLElement).dataset.page))
      },
      { root: el, threshold: [0.6] }
    )
    el.querySelectorAll('[data-page]').forEach(p => io.observe(p))
    return () => io.disconnect()
  }, [])

  function goToPage(i: number) {
    pages.current?.querySelector<HTMLElement>(`[data-page="${i}"]`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest', inline: 'start' })
  }

  const art = draft.mode === 'art'
  const thumbs = art && !artHasBackground(draft.set)
  const canSave = art || draft.text.trim().length > 0

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/preferences/avatar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toAvatar(draft)) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'משהו השתבש. נסו שוב')
      onSaved()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const pane = 'absolute inset-0 transition-[opacity,transform] duration-fast ease-ui motion-reduce:transition-none'
  const off = 'pointer-events-none translate-y-1.5 opacity-0 motion-reduce:translate-y-0'
  const bleed = '-mx-5 sm:-mx-6'

  return (
    <div className="mt-4">
      {/* Mode switch: the pill slides under the chosen side (אות on the right) */}
      <div
        role="tablist"
        aria-label="סוג התמונה"
        data-mode={draft.mode}
        // Two tabs: either arrow moves to the other one, as tabs do (the selected one holds the tab stop)
        onKeyDown={e => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const next = draft.mode === 'art' ? 'text' : 'art'
          set({ mode: next })
          e.currentTarget.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus()
        }}
        className="group relative mb-3.5 grid grid-cols-2 rounded-xl bg-muted p-[3px]">
        <span
          aria-hidden
          className="absolute inset-y-[3px] start-[3px] w-[calc(50%-3px)] rounded-[9px] bg-card shadow-sm transition-transform duration-fast ease-ui motion-reduce:transition-none group-data-[mode=art]:-translate-x-full"
        />
        {(['text', 'art'] as const).map(m => (
          <button
            key={m}
            type="button"
            role="tab"
            data-tab={m}
            tabIndex={draft.mode === m ? 0 : -1}
            aria-selected={draft.mode === m}
            onClick={() => set({ mode: m })}
            className={cn(
              'relative rounded-[9px] py-1.5 text-[0.8125rem] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              draft.mode === m ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {m === 'text' ? 'אות' : 'איור'}
          </button>
        ))}
      </div>

      <div className="mb-3 flex justify-center">
        <Preview draft={draft} />
      </div>

      {/* The same height in both modes; they cross-fade inside it */}
      <div className="relative h-[206px]">
        <div className={cn(pane, !art && off)} inert={!art}>
          <div ref={pages} className={cn(bleed, 'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>
            {AVATAR_SETS.map((s, p) => (
              <div key={s} data-page={p} className="basis-full flex-none snap-start snap-always px-4 py-1.5">
                <div className="grid grid-cols-4 gap-2.5">
                  {SEEDS.map(seed => {
                    const sel = draft.set === s && draft.seed === seed
                    return (
                      <button
                        key={seed}
                        type="button"
                        aria-label={seed}
                        aria-pressed={sel}
                        onClick={() => set({ set: s, seed })}
                        className={cn('h-[52px] w-[52px] justify-self-center overflow-hidden rounded-[30%] bg-[#e6ebf2] focus-visible:outline-none focus-visible:ring-primary/60', RING, PRESS, sel && 'ring-primary')}
                        style={sel && artHasBackground(s) ? { backgroundColor: PASTEL[draft.bg] } : undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={artUri(s, seed)} alt="" draggable={false} className="h-full w-full" />
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* The dots turn the page too (a tap instead of a swipe); each is a 24px target around its dot */}
          <div className="mt-1 flex justify-center">
            {AVATAR_SETS.map((s, i) => (
              <button
                key={s}
                type="button"
                aria-label={`קבוצת איורים ${i + 1} מתוך ${AVATAR_SETS.length}`}
                aria-current={page === i || undefined}
                onClick={() => goToPage(i)}
                className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={cn('h-1.5 rounded-full transition-[width,background-color] duration-fast ease-ui motion-reduce:transition-none', page === i ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/50')} />
              </button>
            ))}
          </div>
        </div>

        <div className={cn(pane, art && off)} inert={art}>
          <div className="grid grid-cols-4 items-center gap-2.5 py-1.5">
            {INK.map((c, i) => (
              <button
                key={c}
                type="button"
                aria-label={`צבע טקסט ${i + 1}`}
                aria-pressed={draft.ink === i}
                onClick={() => set({ ink: i })}
                className={cn('my-2 h-9 w-9 justify-self-center rounded-[30%] outline outline-1 -outline-offset-1 outline-white/15 focus-visible:outline-none focus-visible:ring-primary/60', RING, PRESS, draft.ink === i && 'ring-primary')}
                style={{ backgroundColor: c }}
              />
            ))}
            <label
              className="col-span-full flex h-[52px] items-center gap-2 rounded-xl border border-border bg-muted px-3 transition-shadow focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20"
              style={{ marginInline: 'calc(((100% - 30px) / 4 - 52px) / 2)' }}
            >
              <input
                dir="auto"
                value={draft.text}
                onChange={e => set({ text: [...e.target.value].slice(0, TEXT_MAX).join('') })}
                placeholder="טקסט, עד 12 תווים"
                aria-label="הטקסט בתמונה, עד 12 תווים"
                className="min-w-0 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-muted-foreground sm:text-sm"
              />
              <small className="text-[0.71875rem] tabular-nums text-muted-foreground">{[...draft.text].length}/{TEXT_MAX}</small>
            </label>
          </div>
        </div>
      </div>

      {/* Thumbs bring their own colour: the row stays, dimmed and not tappable */}
      <div className={cn('transition-opacity duration-fast ease-ui motion-reduce:transition-none', thumbs && 'opacity-35')}>
        <div className="mb-[7px] mt-3 text-xs text-muted-foreground">רקע</div>
        <div className="grid grid-cols-10 gap-1">
          {PASTEL.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={`רקע ${i + 1}`}
              aria-pressed={!thumbs && draft.bg === i}
              disabled={thumbs}
              onClick={() => set({ bg: i })}
              className={cn('h-6 w-6 justify-self-center rounded-full focus-visible:outline-none focus-visible:ring-foreground/60', RING, PRESS, !thumbs && draft.bg === i && 'ring-foreground')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <p role="alert" className="mt-2 min-h-4 text-xs text-destructive">{error}</p>
      <div className="mt-1.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={save}
          disabled={busy || !canSave}
          className="h-11 rounded-[13px] bg-primary text-sm font-semibold text-primary-foreground transition-[transform,opacity] duration-quick ease-ui active:scale-[0.97] disabled:opacity-40 motion-reduce:transition-none"
        >
          שמירה
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-[13px] border border-border bg-muted text-sm font-semibold transition-[transform,background-color] duration-quick ease-ui hover:bg-muted/70 active:scale-[0.97] motion-reduce:transition-none"
        >
          ביטול
        </button>
      </div>
    </div>
  )
}

/** The person's own avatar: a drawn character or a few letters, on a pastel (Settings → People) */
export function AvatarPicker({
  open,
  onOpenChange,
  avatar,
  name,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  avatar: Avatar | null
  name: string
  onSaved: () => void
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="התמונה שלך" closeButton={false} className="sm:max-w-sm">
      <PickerBody avatar={avatar} name={name} onClose={() => onOpenChange(false)} onSaved={onSaved} />
    </AppDialog>
  )
}
