'use client'

import type { InstallView } from '@/lib/install/types'
import { ContainerApplyStatus, ContainerSettingField, useContainerSettings } from './container-settings'

/** Why the app can't change these itself (the controls then show manual steps) */
const WHY_MANUAL: Record<Exclude<InstallView['helper'], 'ready'>, string> = {
  none: 'רכיב העדכון לא פועל, אז משנים את ההגדרות האלה ידנית.',
  old: 'רכיב העדכון ישן מדי לשינוי ההגדרות האלה מכאן. אחרי העדכון הבא זה יעבוד, ועד אז משנים ידנית.',
  unavailable: 'רכיב העדכון לא מחובר לתיקייה של תזרים, אז משנים את ההגדרות האלה ידנית.',
}

/**
 * Settings → Installation (ENG-121): this computer's address and the phones' port, and changing
 * both. Rendered by /settings/install; /setup can render it as a step too.
 */
export function InstallSettings({ initial }: { initial: InstallView }) {
  const settings = useContainerSettings(initial)
  const { values, view } = settings
  const computer = `http://localhost:${values.TAZRIM_PORT}`

  return (
    <div className="space-y-4">
      <section aria-labelledby="install-addresses" className="space-y-3 rounded-xl surface p-5">
        <h2 id="install-addresses" className="text-base font-semibold">
          כתובות
        </h2>
        <dl className="space-y-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">במחשב הזה</dt>
            <dd dir="ltr" className="font-mono tabular-nums">
              {computer}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">בטלפונים ובטאבלטים</dt>
            <dd dir="ltr" className="font-mono tabular-nums">
              {values.TAZRIM_LAN_IP ? `http://${values.TAZRIM_LAN_IP}:${values.TAZRIM_PHONE_PORT}` : `פורט ${values.TAZRIM_PHONE_PORT}`}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="install-ports" className="space-y-4 rounded-xl surface p-5">
        <div className="space-y-1">
          <h2 id="install-ports" className="text-base font-semibold">
            פורטים
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            {settings.canApply
              ? 'אחרי שמירה תזרים מופעל מחדש על הפורט החדש, והדף עובר אליו לבד.'
              : WHY_MANUAL[view.helper as Exclude<InstallView['helper'], 'ready'>]}
          </p>
        </div>
        <ContainerSettingField
          settings={settings}
          name="TAZRIM_PORT"
          label="הפורט במחשב הזה"
          hint="נפתח רק מהמחשב שתזרים רץ עליו."
          inputMode="numeric"
          placeholder="3000"
        />
        <ContainerSettingField
          settings={settings}
          name="TAZRIM_PHONE_PORT"
          label="הפורט לטלפונים ולטאבלטים"
          hint="נפתח מכל מכשיר ברשת הביתית."
          inputMode="numeric"
          placeholder="3001"
        />
        {settings.canApply && <ContainerApplyStatus settings={settings} />}
      </section>
    </div>
  )
}
