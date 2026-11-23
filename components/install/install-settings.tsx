'use client'

import { useState } from 'react'
import type { ConfigKey, InstallView } from '@/lib/install/types'
import { cn } from '@/lib/utils/cn'
import { ContainerApplyStatus, ContainerSettingField, ManualEnvSteps, useContainerSettings, type ContainerSettings } from './container-settings'
import { OldUpdaterNote, SectionHeading, sectionClass } from './guide'

/** Why the app can't change these itself (the controls then show manual steps) */
const WHY_MANUAL: Record<Exclude<InstallView['helper'], 'ready'>, string> = {
  none: 'רכיב העדכון לא פועל, אז משנים את ההגדרות האלה ידנית.',
  old: 'משנים את ההגדרות האלה ידנית, או מעדכנים את שירות העזר (למטה).',
  unavailable: 'רכיב העדכון לא מחובר לתיקייה של תזרים, אז משנים את ההגדרות האלה ידנית.',
}

const KEYS = ['TAZRIM_LAN_IP', 'TAZRIM_PORT', 'TAZRIM_PHONE_PORT'] as const satisfies readonly ConfigKey[]

/** On its own (tests, or a page of its own): the advanced section with its own settings */
export function InstallSettings({ initial }: { initial: InstallView }) {
  const settings = useContainerSettings(initial)
  return <AdvancedSection settings={settings} />
}

/**
 * Settings → Phones and network → "מתקדם" (ENG-121/122): this computer's address on the home
 * network and the two ports, each saved through the helper. Without it, one "הצגת שלבים ידניים"
 * for the three, with the values as typed.
 */
export function AdvancedSection({ settings }: { settings: ContainerSettings }) {
  const { values, view } = settings
  const [drafts, setDrafts] = useState<Record<(typeof KEYS)[number], string>>({
    TAZRIM_LAN_IP: values.TAZRIM_LAN_IP,
    TAZRIM_PORT: values.TAZRIM_PORT,
    TAZRIM_PHONE_PORT: values.TAZRIM_PHONE_PORT,
  })
  const draft = (key: (typeof KEYS)[number]) => (value: string) => setDrafts(d => ({ ...d, [key]: value }))

  return (
    <section id="advanced" aria-labelledby="advanced-title" className={cn('scroll-mt-6 space-y-4', sectionClass(false))}>
      <SectionHeading
        id="advanced-title"
        line={
          settings.canApply
            ? 'הכתובת של המחשב והפורטים. אחרי שמירה תזרים מופעל מחדש, והדף עובר לכתובת החדשה לבד.'
            : WHY_MANUAL[view.helper as Exclude<InstallView['helper'], 'ready'>]
        }
      >
        מתקדם
      </SectionHeading>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="text-muted-foreground">במחשב הזה תזרים פתוח בכתובת</span>
        <bdi dir="ltr" className="font-mono tabular-nums">
          http://localhost:{values.TAZRIM_PORT}
        </bdi>
      </p>
      <ContainerSettingField
        settings={settings}
        name="TAZRIM_LAN_IP"
        label="הכתובת של המחשב ברשת הביתית"
        hint={values.TAZRIM_LAN_IP ? 'משתנה? שומרים לו כתובת קבועה בנתב (במדריך "שהכתובת לא תשתנה"), ומתקנים כאן.' : 'למשל 192.168.1.20'}
        placeholder="192.168.1.20"
        inputMode="decimal"
        manual={false}
        onDraftChange={draft('TAZRIM_LAN_IP')}
      />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <ContainerSettingField
          settings={settings}
          name="TAZRIM_PORT"
          label="הפורט במחשב הזה"
          hint="נפתח רק מהמחשב שתזרים רץ עליו."
          inputMode="numeric"
          placeholder="3000"
          manual={false}
          onDraftChange={draft('TAZRIM_PORT')}
        />
        <ContainerSettingField
          settings={settings}
          name="TAZRIM_PHONE_PORT"
          label="הפורט לטלפונים ולטאבלטים"
          hint="נפתח מכל מכשיר ברשת הביתית."
          inputMode="numeric"
          placeholder="3001"
          manual={false}
          onDraftChange={draft('TAZRIM_PHONE_PORT')}
        />
      </div>
      {settings.canApply ? (
        <ContainerApplyStatus settings={settings} only={[...KEYS]} />
      ) : (
        <>
          {view.helper === 'old' && <OldUpdaterNote />}
          <ManualEnvSteps lines={KEYS.map(k => `${k}=${drafts[k]}`)} installDir={view.installDir} />
        </>
      )}
    </section>
  )
}
