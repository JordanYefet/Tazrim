import { EGRESS_MESSAGES } from '@/lib/egress/messages'

/** Fixed Hebrew wording for the helper's refusals (the helper's own English text never reaches the browser) */
export const MESSAGES: Record<string, string> = {
  NO_HELPER: 'שירות העדכון לא זמין. מעדכנים ידנית',
  BUSY: 'עדכון או שחזור כבר רץ',
  NOT_NEWER: 'הגרסה הזו אינה חדשה מהגרסה הנוכחית',
  NOT_LATEST: 'אפשר לעדכן רק לגרסה האחרונה שנמצאה. בדקו עדכונים שוב',
  NOT_UPDATABLE: 'ההתקנה הזו לא מתעדכנת מתוך תזרים',
  NO_ROLLBACK: 'אין עדכון שאפשר לחזור ממנו',
  HELPER_ERROR: 'העדכון לא התחיל. נסו שוב',
  // The compose files an update brings (ENG-137)
  COMPOSE_FETCH_FAILED: 'לא הצלחנו להביא מ-GitHub את קובצי ההתקנה של הגרסה החדשה. נסו שוב בעוד רגע',
  COMPOSE_CHANGED: 'קובצי ההתקנה השתנו מאז שהוצגו. בודקים שוב מההתחלה',
  COMPOSE_NEEDS_CONFIRM: 'העדכון משנה את קובצי ההתקנה וצריך את האישור שלך. בודקים שוב מההתחלה',
  COMPOSE_FAILED: 'הגרסה החדשה רצה, אבל קובצי ההתקנה נשארו כמו שהיו',
}

/** The wording of a helper code: its own, or the approval's (the egress approvals share their codes) */
export const messageFor = (code: string): string => MESSAGES[code] ?? EGRESS_MESSAGES[code] ?? MESSAGES.HELPER_ERROR
