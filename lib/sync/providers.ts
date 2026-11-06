/**
 * The banks and card companies a sync can log in to (israeli-bank-scrapers,
 * ENG-91): each one's Hebrew name, the kind of Tazrim account it fills, the
 * Tazrim provider key (lib/accounts/brands.ts) and the login fields its site asks for.
 *
 * Kept free of the scraper package so the client can import it.
 */
import type { AccountKind } from '@prisma/client'

export type LoginField = 'username' | 'userCode' | 'id' | 'num' | 'card6Digits' | 'nationalID' | 'email' | 'phoneNumber' | 'password'

export interface SyncCompany {
  /** israeli-bank-scrapers CompanyTypes value */
  id: string
  label: string
  kind: Extract<AccountKind, 'BANK' | 'CREDIT_CARD'>
  /** Account.provider of the accounts it fills */
  provider: string
  fields: LoginField[]
  /** The site sends a code by SMS on every login, typed in while the sync waits */
  otp?: boolean
  /**
   * How far back a sync can reach, in months: the library's own limit for the site
   * (israeli-bank-scrapers clamps the start date to it). The Beinleumi group sets
   * none, so the site decides; three years is asked there.
   */
  historyMonths: number
  /**
   * Set when `historyMonths` goes past what the library itself reaches (a patch lifts its
   * limit, patches/): beyond this many months the site may refuse, so the form marks those
   * ranges as experimental and the result says how far back it answered.
   */
  provenMonths?: number
}

export const SYNC_COMPANIES: SyncCompany[] = [
  { id: 'leumi', label: 'בנק לאומי', kind: 'BANK', provider: 'leumi', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'hapoalim', label: 'בנק הפועלים', kind: 'BANK', provider: 'hapoalim', fields: ['userCode', 'password'], historyMonths: 12 },
  { id: 'discount', label: 'בנק דיסקונט', kind: 'BANK', provider: 'discount', fields: ['id', 'password', 'num'], historyMonths: 12 },
  { id: 'mizrahi', label: 'מזרחי טפחות', kind: 'BANK', provider: 'mizrahi', fields: ['username', 'password'], historyMonths: 12 },
  { id: 'mercantile', label: 'בנק מרכנתיל', kind: 'BANK', provider: 'mercantile', fields: ['id', 'password', 'num'], historyMonths: 12 },
  { id: 'beinleumi', label: 'הבנק הבינלאומי', kind: 'BANK', provider: 'beinleumi', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'otsarHahayal', label: 'בנק אוצר החייל', kind: 'BANK', provider: 'otsarhahayal', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'massad', label: 'בנק מסד', kind: 'BANK', provider: 'massad', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'pagi', label: 'בנק פאג"י', kind: 'BANK', provider: 'pagi', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'yahav', label: 'בנק יהב', kind: 'BANK', provider: 'yahav', fields: ['username', 'nationalID', 'password'], historyMonths: 3 },
  { id: 'union', label: 'בנק איגוד', kind: 'BANK', provider: 'union', fields: ['username', 'password'], historyMonths: 12 },
  { id: 'oneZero', label: 'וואן זירו', kind: 'BANK', provider: 'onezero', fields: ['email', 'password', 'phoneNumber'], historyMonths: 12, otp: true },
  { id: 'max', label: 'מקס', kind: 'CREDIT_CARD', provider: 'max', fields: ['username', 'password'], historyMonths: 48 },
  { id: 'visaCal', label: 'כאל', kind: 'CREDIT_CARD', provider: 'cal', fields: ['username', 'password'], historyMonths: 36 },
  { id: 'isracard', label: 'ישראכרט', kind: 'CREDIT_CARD', provider: 'isracard', fields: ['id', 'card6Digits', 'password'], historyMonths: 12 },
  { id: 'amex', label: 'אמריקן אקספרס', kind: 'CREDIT_CARD', provider: 'amex', fields: ['id', 'card6Digits', 'password'], historyMonths: 12 },
]

/** Companies tried end to end with a real account; the rest say "לא נבדק עדיין". */
export const VERIFIED_COMPANIES = new Set<string>(['visaCal'])

export const FIELD_LABELS: Record<LoginField, string> = {
  username: 'שם משתמש',
  userCode: 'קוד משתמש',
  id: 'תעודת זהות',
  num: 'קוד מזהה',
  card6Digits: '6 ספרות אחרונות של הכרטיס',
  nationalID: 'תעודת זהות',
  email: 'אימייל',
  phoneNumber: 'מספר טלפון',
  password: 'סיסמה',
}

export function syncCompany(id: unknown): SyncCompany | null {
  return SYNC_COMPANIES.find(c => c.id === id) ?? null
}

/** The company whose sync fills accounts of this kind and provider. */
export function companyForAccount(kind: string, provider: string): SyncCompany | null {
  return SYNC_COMPANIES.find(c => c.kind === kind && c.provider === provider) ?? null
}

/**
 * The login the request sent, with exactly the company's fields, each a
 * non-empty string of a sane length. Null when something is missing.
 */
export function validateCredentials(company: SyncCompany, value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null
  const src = value as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const f of company.fields) {
    const v = src[f]
    if (typeof v !== 'string') return null
    const s = f === 'password' ? v : v.trim()
    if (!s || s.length > 200) return null
    out[f] = s
  }
  return out
}
