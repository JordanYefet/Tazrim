import { SelectSetting } from './app-setting-controls'
import type { SettingView } from '@/lib/settings/app-settings'

/** The common zones, Israel first; the current one is added by the select when it is none of them */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Asia/Jerusalem', label: 'ישראל (Asia/Jerusalem)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'לונדון (Europe/London)' },
  { value: 'Europe/Paris', label: 'פריז, ברלין, רומא (Europe/Paris)' },
  { value: 'Europe/Athens', label: 'אתונה (Europe/Athens)' },
  { value: 'Europe/Moscow', label: 'מוסקבה (Europe/Moscow)' },
  { value: 'Asia/Dubai', label: 'דובאי (Asia/Dubai)' },
  { value: 'Asia/Kolkata', label: 'הודו (Asia/Kolkata)' },
  { value: 'Asia/Bangkok', label: 'בנגקוק (Asia/Bangkok)' },
  { value: 'Asia/Tokyo', label: 'טוקיו (Asia/Tokyo)' },
  { value: 'Australia/Sydney', label: 'סידני (Australia/Sydney)' },
  { value: 'America/New_York', label: 'ניו יורק (America/New_York)' },
  { value: 'America/Chicago', label: 'שיקגו (America/Chicago)' },
  { value: 'America/Denver', label: 'דנבר (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'לוס אנג׳לס (America/Los_Angeles)' },
  { value: 'America/Sao_Paulo', label: 'סאו פאולו (America/Sao_Paulo)' },
]

/** A zone's name as the select shows it */
export const timeZoneLabel = (tz: string) => TIME_ZONES.find(z => z.value === tz)?.label ?? tz

/**
 * The time zone (ENG-120), one card that saves when picked: on Settings → General and
 * as a step of the first run (ENG-125), so the two never drift apart.
 */
export function TimeZoneSetting({ setting }: { setting: SettingView<string> }) {
  return (
    <SelectSetting
      name="timeZone"
      title="אזור זמן"
      help="תאריכים וחודשים נספרים לפי האזור הזה. הוא צריך להתאים למקום שבו נוצרו הנתונים, אחרת התנועות של סוף החודש עלולות לעבור לחודש אחר."
      label="אזור זמן"
      value={setting.value}
      locked={setting.locked}
      options={TIME_ZONES}
    />
  )
}
