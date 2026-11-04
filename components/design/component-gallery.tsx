'use client'

import { useState, type ReactNode } from 'react'
import { AppDialog } from '@/components/ui/app-dialog'
import { DimmablePair } from '@/components/ui/dimmable-pair'
import { Reveal } from '@/components/ui/reveal'
import { RollingNumber } from '@/components/ui/rolling-number'
import { SegmentedTrack } from '@/components/ui/segmented'
import { AccountMini, BankElement, PaymentCard } from '@/components/accounts/account-element'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DataSwap } from '@/components/ui/data-swap'
import { MonthBarsChart } from '@/components/cards/month-bars'
import { BalanceChart } from '@/components/bank/balance-chart'
import { EmptyMonthSlots } from '@/components/ui/month-slots'
import { Bar, BarChart, Customized, XAxis } from 'recharts'
import { monthName } from '@/lib/utils/date'

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

// Made-up data, 2030
const MONTH_VALUES: Record<number, number> = { 1: 420, 2: 380, 3: 610, 4: 540, 5: 0, 6: 720, 7: 0 }

const SLOT_ROWS = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1
  const value = [300, 450, 0, 520, 380, 0, 0, 0, 0, 0, 0, 0][i]
  return { month, name: monthName(month), empty: value === 0, value }
})

const BALANCE_POINTS = [
  { date: '2030-04-05', balance: 8_900 },
  { date: '2030-03-20', balance: 7_400 },
  { date: '2030-03-10', balance: 8_100 },
  { date: '2030-03-01', balance: 6_300 },
]

const SWAP_ROWS = [
  ['קפה', '₪18'],
  ['סופר', '₪240'],
  ['דלק', '₪310'],
]

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [swap, setSwap] = useState(0)
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

      <Item name="AccountMini" path="components/accounts/account-element.tsx">
        <div className="flex items-center gap-3">
          <AccountMini kind="BANK" provider="leumi" />
          <AccountMini kind="CREDIT_CARD" provider="max" network="mastercard" />
        </div>
      </Item>

      <Item name="ConfirmDialog" path="components/ui/confirm-dialog.tsx">
        <button className={button} onClick={() => setConfirmOpen(true)}>פתח אישור</button>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => setConfirmOpen(false)}
          title="למחוק את הפריט לדוגמה?"
          description="זו הדגמה בלבד, שום דבר לא נמחק."
        />
      </Item>

      <Item name="DataSwap" path="components/ui/data-swap.tsx">
        <DataSwap swapKey={swap} className="surface rounded-xl p-4">
          <ul className="space-y-1 text-sm">
            {SWAP_ROWS.map((_, i) => {
              const [label, value] = SWAP_ROWS[(i + swap) % SWAP_ROWS.length]
              return (
                <li key={i} className="flex justify-between tabular-nums">
                  <span>{label}</span>
                  <span>{value}</span>
                </li>
              )
            })}
          </ul>
        </DataSwap>
        <button className={button} onClick={() => setSwap(n => n + 1)}>החלף נתונים</button>
      </Item>

      <Item name="MonthBarsChart" path="components/cards/month-bars.tsx">
        <div className="flex h-32 flex-col">
          <MonthBarsChart values={MONTH_VALUES} selectedMonth={4} average={500} tone="cc" caption="חיובים בכל חודש" />
        </div>
      </Item>

      <Item name="EmptyMonthSlots" path="components/ui/month-slots.tsx">
        <div dir="ltr" className="overflow-hidden">
          <BarChart width={360} height={140} data={SLOT_ROWS}>
            <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
            <Customized component={<EmptyMonthSlots selectedMonth={3} maxWidth={28} />} />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          </BarChart>
        </div>
      </Item>

      <Item name="BalanceChart" path="components/bank/balance-chart.tsx">
        <BalanceChart data={BALANCE_POINTS} />
      </Item>
    </div>
  )
}
