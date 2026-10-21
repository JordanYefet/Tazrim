'use client'

import { useId, useRef } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { faceFor, providerLabel, type FaceKind } from '@/lib/accounts/brands'
import {
  ACCOUNT_PALETTE,
  choiceLabel,
  GLASS,
  inkFor,
  parseColorChoice,
} from '@/lib/accounts/colors'

/**
 * The account colour (ENG-66): the brand default (pre-selected, its swatch
 * shows the provider's own face), the curated swatches, glass and a custom
 * colour (the system colour picker). `value` is what Account.color stores.
 */
export function ColorPicker({
  kind,
  provider,
  value,
  onChange,
  fallbackColor,
}: {
  kind: FaceKind
  provider: string
  value: string | null
  onChange: (value: string | null) => void
  /** The positional colour the brand default falls back to, when the provider has no face */
  fallbackColor?: string
}) {
  const id = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  const choice = parseColorChoice(value)
  const custom = choice.type === 'custom' ? choice.hex : null
  const defaultFace = faceFor(kind, provider, fallbackColor, null)
  const brand = provider ? providerLabel(provider) : ''

  const options: { key: string; value: string | null; label: string }[] = [
    { key: 'default', value: null, label: brand ? `ברירת מחדל (${brand})` : 'ברירת מחדל' },
    ...ACCOUNT_PALETTE.map(p => ({ key: p.key, value: p.key, label: p.label })),
    { key: GLASS, value: GLASS, label: 'זכוכית' },
  ]
  const selectedKey = choice.type === 'default' ? 'default' : choice.type === 'palette' ? choice.key : choice.type === 'glass' ? GLASS : 'custom'
  const shownLabel =
    choice.type === 'default' ? options[0].label : choice.type === 'custom' ? `${choiceLabel(choice)} ${choice.hex}` : choiceLabel(choice)

  // Arrow keys move between swatches like any radio group (RTL: right goes back)
  function onKeyDown(e: React.KeyboardEvent) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const radios = [...(groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    const at = radios.indexOf(document.activeElement as HTMLElement)
    if (at === -1) return
    e.preventDefault()
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? 1 : -1
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (at + step + radios.length) % radios.length
    radios[next].focus()
    // The custom swatch opens the system picker, so arrows only focus it (Enter / Space opens it)
    if (radios[next].dataset.color !== 'custom') radios[next].click()
  }

  return (
    <div className="space-y-1.5">
      <p id={`${id}-label`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
        צבע
        <span className="text-xs font-normal text-muted-foreground" aria-live="polite">
          {shownLabel}
        </span>
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        onKeyDown={onKeyDown}
        className="-mx-1.5 flex flex-wrap"
      >
        {options.map(o => {
          const selected = selectedKey === o.key
          const hex = ACCOUNT_PALETTE.find(p => p.key === o.key)?.hex
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              title={o.label}
              tabIndex={selected ? 0 : -1}
              data-color={o.key}
              onClick={() => onChange(o.value)}
              className="color-swatch"
            >
              <span
                className={cn('color-swatch__dot', o.key === GLASS && 'color-swatch__dot--glass')}
                style={
                  o.key === 'default'
                    ? { background: `linear-gradient(135deg, ${defaultFace.stops[0]}, ${defaultFace.stops[1]} 55%, ${defaultFace.stops[2]})` }
                    : hex
                      ? { backgroundColor: hex }
                      : undefined
                }
              />
              {selected && (
                <Check
                  aria-hidden
                  strokeWidth={3}
                  className={cn(
                    'pointer-events-none absolute h-3.5 w-3.5',
                    o.key === GLASS ? 'text-[#16181d] dark:text-white' : hex && inkFor(hex) === 'dark' ? 'text-[#16181d]' : 'text-white'
                  )}
                />
              )}
            </button>
          )
        })}
        {/* Custom: the system colour picker, opened by the swatch itself */}
        <label
          role="radio"
          aria-checked={selectedKey === 'custom'}
          aria-label={custom ? `צבע מותאם ${custom}` : 'צבע מותאם'}
          title="צבע מותאם"
          tabIndex={selectedKey === 'custom' ? 0 : -1}
          data-color="custom"
          className="color-swatch cursor-pointer"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              ;(e.currentTarget.querySelector('input') as HTMLInputElement | null)?.click()
            }
          }}
        >
          <span
            className={cn('color-swatch__dot', !custom && 'color-swatch__dot--custom')}
            style={custom ? { backgroundColor: custom } : undefined}
          />
          {custom && (
            <Check
              aria-hidden
              strokeWidth={3}
              className={cn('pointer-events-none absolute h-3.5 w-3.5', inkFor(custom) === 'dark' ? 'text-[#16181d]' : 'text-white')}
            />
          )}
          <input
            type="color"
            tabIndex={-1}
            aria-hidden
            className="color-swatch__input"
            value={custom ?? '#3f8cff'}
            onChange={e => onChange(e.target.value.toLowerCase())}
          />
        </label>
      </div>
    </div>
  )
}
