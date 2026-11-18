'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils/cn'
import { TEXT_SIZES, type A11yFlag, type A11ySettings, type TextSize } from '@/lib/a11y/settings'
import { A11Y_DEFAULTS, sameA11y } from '@/lib/a11y/settings'
import { useA11y } from './a11y-provider'

/*
 * Settings → נגישות (ENG-128; the approved mockup, option A with the sample pinned).
 * One grouped list of switches, with a compact sample card pinned under the app header while
 * the page scrolls. Every switch applies to the whole app as it is flipped (the page and the
 * sample included); the sample just makes each effect easy to see.
 */

interface Row {
  flag: A11yFlag
  title: string
  desc: string
}

const TEXT_ROWS: Row[] = [
  { flag: 'font', title: 'גופן קריא', desc: 'אותיות פתוחות ורחבות יותר, שקל להבדיל ביניהן' },
  { flag: 'bold', title: 'טקסט מודגש', desc: 'כל הטקסט באפליקציה עבה יותר' },
  { flag: 'spacing', title: 'ריווח טקסט', desc: 'יותר מקום בין אותיות, מילים ושורות' },
]
const COLOR_ROWS: Row[] = [
  { flag: 'contrast', title: 'ניגודיות גבוהה', desc: 'רקע אחיד בלי זכוכית, טקסט כהה וגבולות ברורים' },
  { flag: 'cb', title: 'צבעים לעיוורון צבעים', desc: 'כחול וכתום במקום ירוק ואדום, וחץ ליד כל סכום' },
]
const NAV_ROWS: Row[] = [
  { flag: 'still', title: 'עצירת אנימציות', desc: 'מספרים, כרטיסים ומעברים מופיעים בלי תנועה' },
  { flag: 'focus', title: 'מסגרת מיקוד בולטת', desc: 'מסגרת עבה סביב מה שנבחר במקלדת' },
  { flag: 'underline', title: 'קו תחתון לקישורים ולכפתורים', desc: 'רואים מה לחיץ בלי להסתמך על צבע' },
]

/** Arrow keys move through a radiogroup (RTL: left is next). */
function arrowStep(e: KeyboardEvent): 1 | -1 | 0 {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') return 1
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') return -1
  return 0
}

const GROUP_TITLE = 'mx-1 text-[0.8125rem] font-semibold text-muted-foreground'
const LIST = 'overflow-hidden rounded-2xl surface'

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        // The hit area is 44px tall: the switch itself is 31px
        'relative flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-fast ease-ui motion-reduce:transition-none',
        'before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-[""]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        checked ? 'bg-primary' : 'bg-foreground/20 ring-1 ring-inset ring-border'
      )}
    >
      <span
        aria-hidden
        className={cn(
          // RTL: the knob sits on the right when off and slides left when on
          'h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-fast ease-ui motion-reduce:transition-none',
          checked ? '-translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
}

function SwitchRow({ row, first }: { row: Row; first?: boolean }) {
  const { settings, update } = useA11y()
  return (
    <div className={cn('flex items-center gap-3.5 px-4 py-3.5', !first && 'border-t border-border/60')}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-semibold">{row.title}</span>
        <span className="text-[0.8125rem] leading-[1.45] text-muted-foreground">{row.desc}</span>
      </div>
      <Switch checked={settings[row.flag]} label={row.title} onChange={on => update({ [row.flag]: on })} />
    </div>
  )
}

function SizePicker() {
  const { settings, update } = useA11y()
  const refs = useRef<Record<number, HTMLButtonElement | null>>({})

  function onKey(e: KeyboardEvent) {
    const dir = arrowStep(e)
    if (!dir) return
    e.preventDefault()
    const i = TEXT_SIZES.indexOf(settings.size)
    const next = TEXT_SIZES[(i + dir + TEXT_SIZES.length) % TEXT_SIZES.length]
    update({ size: next })
    refs.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5">
      <span id="a11y-size-label" className="text-[0.9375rem] font-semibold">
        גודל טקסט
      </span>
      <div
        role="radiogroup"
        aria-labelledby="a11y-size-label"
        onKeyDown={onKey}
        className="grid grid-cols-4 gap-0.5 rounded-xl border border-border bg-muted p-[3px]"
      >
        {TEXT_SIZES.map((v: TextSize) => {
          const on = settings.size === v
          return (
            <button
              key={v}
              ref={el => {
                refs.current[v] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => update({ size: v })}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-center rounded-[9px] transition-[background-color,box-shadow,color] duration-fast ease-ui motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'bg-card text-foreground shadow-e1' : 'text-muted-foreground'
              )}
            >
              <span aria-hidden className="font-semibold leading-[1.1]" style={{ fontSize: `${((0.9375 * v) / 100).toFixed(4)}rem` }}>
                א
              </span>
              <span className="text-[0.71875rem] font-medium">{v}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** The compact sample: what the options do, in one small card (fake figures) */
function Sample({ settings }: { settings: A11ySettings }) {
  return (
    <div
      // Phones and tablets: pinned under the app header across the page, page-coloured and nearly
      // opaque so rows scroll away under it. Wide screens: its own column beside the options,
      // staying in view while they scroll
      className={cn(
        'a11y-sample-pin sticky z-20 -mx-4 border-b border-border/80 bg-[hsl(var(--background)/0.94)] px-4 pb-2.5 pt-3 md:-mx-6 md:px-6',
        'lg:col-start-2 lg:row-start-1 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-4'
      )}
    >
      <span aria-hidden className="mx-1 mb-2 hidden text-[0.8125rem] font-semibold text-muted-foreground lg:block">
        תצוגה מקדימה
      </span>
      <div role="group" aria-label="תצוגה מקדימה" className="flex flex-col gap-2.5 rounded-2xl surface px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">יתרה בסוף החודש</span>
            <span dir="ltr" className="text-end text-[1.375rem] font-semibold leading-[1.15] tabular-nums">
              ₪12,480
            </span>
          </div>
          <div aria-hidden className="mt-2 h-1 w-12 shrink-0 overflow-hidden rounded-sm bg-muted">
            <div className="a11y-sample-line h-full w-1/2 rounded-sm bg-primary" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span
            dir="ltr"
            data-flow="in"
            className="inline-flex items-center whitespace-nowrap rounded-full border border-border px-2.5 py-[3px] text-sm font-semibold tabular-nums text-[hsl(var(--income))]"
          >
            +₪14,200
          </span>
          <span
            dir="ltr"
            data-flow="out"
            className="inline-flex items-center whitespace-nowrap rounded-full border border-border px-2.5 py-[3px] text-sm font-semibold tabular-nums text-[hsl(var(--expense))]"
          >
            −₪1,240
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <a
            href="#a11y-sample"
            onClick={e => e.preventDefault()}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            לכל התנועות
          </a>
          <button
            type="button"
            data-focus-demo={settings.focus ? '' : undefined}
            className="a11y-sample-btn min-h-11 rounded-[11px] bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            הוספת תנועה
          </button>
        </div>
      </div>
    </div>
  )
}

export function AccessibilitySettings() {
  const { settings, update, reset, error } = useA11y()
  const atDefaults = sameA11y(settings, A11Y_DEFAULTS)
  return (
    // Wide screens: the options in the first column (right, RTL) and the sample beside them
    <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-x-8">
      <Sample settings={settings} />

      <div className="flex min-w-0 flex-col gap-[22px] lg:col-start-1 lg:row-start-1">
        <section className="flex flex-col gap-2" aria-labelledby="a11y-g-text">
          <h2 id="a11y-g-text" className={GROUP_TITLE}>
            טקסט
          </h2>
          <div className={LIST}>
            <SizePicker />
            {TEXT_ROWS.map(r => (
              <SwitchRow key={r.flag} row={r} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="a11y-g-color">
          <h2 id="a11y-g-color" className={GROUP_TITLE}>
            צבע וניגודיות
          </h2>
          <div className={LIST}>
            {COLOR_ROWS.map((r, i) => (
              <SwitchRow key={r.flag} row={r} first={i === 0} />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="a11y-g-nav">
          <h2 id="a11y-g-nav" className={GROUP_TITLE}>
            תנועה וניווט
          </h2>
          <div className={LIST}>
            {NAV_ROWS.map((r, i) => (
              <SwitchRow key={r.flag} row={r} first={i === 0} />
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-3 px-1">
          <p className="text-[0.8125rem] leading-[1.55] text-muted-foreground">
            הגדרות הנגישות של הטלפון או המחשב (הפחתת תנועה, ניגודיות) ממשיכות לפעול גם כשהמתג כאן כבוי.
          </p>
          <button
            type="button"
            onClick={reset}
            disabled={atDefaults}
            className="min-h-11 self-start rounded-lg text-sm font-medium text-primary transition-opacity duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            איפוס להגדרות ברירת המחדל
          </button>
          <p role="alert" className="min-h-5 text-sm text-destructive dark:text-red-400">
            {error}
          </p>
        </div>
      </div>
    </div>
  )
}
