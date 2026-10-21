/**
 * The file layouts the built-in parsers read (lib/parsers/max-cc.ts,
 * lib/parsers/bank-leumi.ts), written as column mappings. Switching a Leumi or
 * Max account to a custom mapping (ENG-69) seeds its profile from here, so it
 * can be edited with no file. Pure, so the client can show the same thing.
 */
import { headerSignature, type ImportMapping, type MappingKind } from './mapping'
import type { HeaderSnapshot } from './snapshot'

export interface BuiltInLayout {
  provider: string
  accountKind: 'BANK' | 'CREDIT_CARD'
  kind: MappingKind
  /** Default name of the seeded profile */
  name: string
  header: string[]
  mapping: ImportMapping
  /** What the built-in importer handles that a mapping may not; shown before and after switching */
  warning: string[]
}

/** Max's header row (row 4 of every sheet), as the parser and its tests read it. */
export const MAX_HEADER = [
  'תאריך עסקה',
  'שם בית העסק',
  'קטגוריה',
  '4 ספרות אחרונות של כרטיס האשראי',
  'סוג עסקה',
  'סכום חיוב',
  'מטבע חיוב',
  'סכום עסקה מקורי',
  'מטבע עסקה מקורי',
  'תאריך חיוב',
  'הערות',
  'תיוגים',
  'מועדון הנחות',
  'מפתח דיסקונט',
  'אופן ביצוע ההעסקה',
  'שער המרה ממטבע מקור/התחשבנות לש"ח',
]

/** Leumi's transactions table header, as bank-leumi.ts reads it (by position). */
export const LEUMI_HEADER = ['תאריך', 'תיאור', 'בחובה', 'בזכות', 'היתרה בש"ח', 'הערה']

const NUMBER = { decimal: '.', thousands: ',' } as const

export const BUILT_IN_LAYOUTS: Record<'max' | 'leumi', BuiltInLayout> = {
  max: {
    provider: 'max',
    accountKind: 'CREDIT_CARD',
    kind: 'card',
    name: 'מקס – מיפוי מותאם',
    header: MAX_HEADER,
    mapping: {
      sheet: 0,
      // three title rows, then the header
      headerRow: 3,
      skipInvalid: true,
      columns: {
        transactionDate: 0,
        merchant: 1,
        category: 2,
        cardLastFour: 3,
        transactionType: 4,
        chargedAmount: 5,
        originalAmount: 7,
        originalCurrency: 8,
        billingDate: 9,
        notes: 10,
      },
      billingDate: { from: 'column' },
      expensesNegative: false,
      dateFormat: 'auto',
      number: { ...NUMBER },
    },
    warning: [
      'הייבוא המובנה קורא את כל הגיליונות בקובץ. במיפוי מותאם נקראים רק גיליונות עם אותה שורת כותרת.',
      'עסקאות שאושרו וטרם נקלטו (בלי תאריך חיוב) מדלגות בשני המצבים, ונספרות בסיכום הייבוא.',
    ],
  },
  leumi: {
    provider: 'leumi',
    accountKind: 'BANK',
    kind: 'bank',
    name: 'לאומי – מיפוי מותאם',
    header: LEUMI_HEADER,
    mapping: {
      sheet: 0,
      // "תנועות בחשבון" above it; the saved header is found again if the file has more rows on top
      headerRow: 1,
      skipInvalid: true,
      columns: { date: 0, description: 1, debit: 2, credit: 3, balance: 4, note: 5 },
      amountMode: 'split',
      expensesNegative: false,
      dateFormat: 'auto',
      number: { ...NUMBER },
    },
    warning: [
      'לאומי מייצא דף HTML בשם ‎.xls. הייבוא המובנה מוצא בו לבד את טבלת התנועות.',
      'במיפוי מותאם כל הטבלאות שבדף נקראות כגיליון אחד, ושורת הכותרת מזוהה לפי הכותרות השמורות. שורות בלי תאריך או בלי סכום מדלגות.',
    ],
  },
}

/** The layout a built-in provider's account would be seeded from, or null. */
export function builtInLayoutFor(account: { kind: string; provider: string }): BuiltInLayout | null {
  const layout = (BUILT_IN_LAYOUTS as Record<string, BuiltInLayout | undefined>)[account.provider]
  return layout && layout.accountKind === account.kind ? layout : null
}

/** The header the seeded profile stores, with no sample rows (there is no file). */
export function layoutSnapshot(layout: BuiltInLayout): HeaderSnapshot {
  return { v: 1, header: [...layout.header], samples: [] }
}

export function layoutSignature(layout: BuiltInLayout): string {
  return headerSignature({ rows: [layout.header] }, 0)
}
