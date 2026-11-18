import { SelectSetting, SwitchSetting, TextSetting } from './app-setting-controls'
import { TimeZoneSetting } from './time-zone-setting'
import type { AppSettingsView } from '@/lib/settings/app-settings'

const CONCURRENCY = Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/**
 * Settings → General (ENG-120): the time zone, how many banks sync at once, and under
 * "מתקדם" the addresses allowed to sign in and passwords over https only. A value set
 * in `.env` shows locked. Changes apply at once.
 */
export function GeneralSettings({ view }: { view: AppSettingsView }) {
  return (
    <div className="space-y-6">
      <TimeZoneSetting setting={view.timeZone} />
      <SelectSetting
        name="syncConcurrency"
        title="בנקים בסנכרון אחד"
        help="כמה חברות מסתנכרנות במקביל ב״סנכרון הכול״. כל אחת פותחת דפדפן נפרד שרץ ברקע, ולכן ככל שיש יותר, המחשב עובד קשה יותר."
        label="מספר בנקים במקביל"
        value={String(view.syncConcurrency.value)}
        locked={view.syncConcurrency.locked}
        options={CONCURRENCY}
      />
      <div className="space-y-6">
        <h2 className="pt-2 text-lg font-semibold tracking-tight">מתקדם</h2>
        <TextSetting
          name="origins"
          title="כתובות מורשות לכניסה"
          help="ריק אומר שאפשר להיכנס מכל כתובת. כדי להגביל, כותבים כתובות מלאות מופרדות בפסיקים, למשל https://tazrim.example.com."
          label="כתובות מורשות"
          placeholder="https://tazrim.example.com"
          value={view.origins.value}
          locked={view.origins.locked}
        />
        <SwitchSetting
          name="requireHttps"
          title="סיסמאות רק בחיבור מאובטח"
          help="כבוי: אפשר להיכנס עם סיסמה גם בכתובת רגילה (http) ברשת הביתית, וכך הכול עובד מהטלפון בלי הגדרות. אבל הסיסמה עוברת בלי הצפנה ברשת ה-Wi-Fi. מופעל: סיסמה עובדת רק ב-https או על המחשב עצמו."
          switchLabel="לדרוש https לסיסמאות"
          value={view.requireHttps.value}
          locked={view.requireHttps.locked}
        />
      </div>
    </div>
  )
}
