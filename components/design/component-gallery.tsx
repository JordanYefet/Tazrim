'use client'

import { useState, type ReactNode } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { DimmablePair } from '@/components/ui/dimmable-pair'
import { Reveal } from '@/components/ui/reveal'
import { RollingNumber } from '@/components/ui/rolling-number'
import { SegmentedTrack } from '@/components/ui/segmented'
import { BankElement, PaymentCard } from '@/components/accounts/account-element'

function Item({ name, path, children }: { name: string; path: string; children: ReactNode }) {
  return (
    <section className="surface rounded-2xl p-5 space-y-4">
      <header>
        <h3 className="text-base font-semibold">{name}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">{path}</code>
      </header>
      {children}
    </section>
  )
}

const SEGMENTS = [
  { key: 'month', label: 'חודש' },
  { key: 'year', label: 'שנה' },
]

export function ComponentGallery() {
  const [amount, setAmount] = useState(12_480)
  const [segment, setSegment] = useState('month')
  const [dim, setDim] = useState<'first' | 'second' | undefined>('second')
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  const button = 'rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Item name="RollingNumber" path="components/ui/rolling-number.tsx">
        <div className="text-3xl font-semibold tabular-nums"><RollingNumber value={amount} /></div>
        <button className={button} onClick={() => setAmount(a => a + 1_234)}>הוסף ₪1,234</button>
      </Item>

      <Item name="SegmentedTrack" path="components/ui/segmented.tsx">
        <SegmentedTrack
          role="radiogroup"
          active={segment}
          thumbClassName="rounded-md bg-card shadow-e1"
          className="inline-flex gap-0.5 rounded-lg border border-border bg-muted p-0.5"
        >
          {SEGMENTS.map(s => (
            <button
              key={s.key}
              role="radio"
              aria-checked={segment === s.key}
              data-segment={s.key}
              data-on={segment === s.key || undefined}
              onClick={() => setSegment(s.key)}
              className="relative rounded-md px-3 py-1 text-sm"
            >
              {s.label}
            </button>
          ))}
        </SegmentedTrack>
      </Item>

      <Item name="DimmablePair" path="components/ui/dimmable-pair.tsx">
        <DimmablePair
          dim={dim}
          first={<div className="surface rounded-xl p-4">הכנסות</div>}
          second={<div className="surface rounded-xl p-4">הוצאות</div>}
        />
        <button className={button} onClick={() => setDim(d => (d === 'second' ? 'first' : 'second'))}>החלף</button>
      </Item>

      <Item name="Reveal" path="components/ui/reveal.tsx">
        <button className={button} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="reveal-demo">
          {open ? 'סגור' : 'פתח'}
        </button>
        <Reveal open={open} id="reveal-demo" className="pt-3">
          <p className="text-sm text-muted-foreground">תוכן שנפתח במקום, בלי שהעמוד יקפוץ.</p>
        </Reveal>
      </Item>

      <Item name="AppDialog" path="components/ui/app-dialog.tsx">
        <button className={button} onClick={() => setDialog(true)}>פתח חלון</button>
        <AppDialog open={dialog} onOpenChange={setDialog} title="חלון לדוגמה">
          <p className="mt-3 text-sm text-muted-foreground">כל חלון באפליקציה נבנה על החלון הזה.</p>
        </AppDialog>
      </Item>

      <Item name="PaymentCard" path="components/accounts/account-element.tsx">
        <div className="max-w-xs">
          <PaymentCard provider="max" name="כרטיס לדוגמה" lastFour="1234" network="mastercard" />
        </div>
      </Item>

      <Item name="BankElement" path="components/accounts/account-element.tsx">
        <div className="max-w-sm">
          <BankElement
            provider="leumi"
            name="חשבון לדוגמה"
            latest={{ balance: 8_200, date: '2030-03-31' }}
            totals={{ income: 15_000, expense: 11_300 }}
            trend={[6_100, 7_400, 6_900, 8_200]}
          />
        </div>
      </Item>
    </div>
  )
}
