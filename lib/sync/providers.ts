/**
 * The banks and card companies a sync can log in to (israeli-bank-scrapers,
 * ENG-91): each one's Hebrew name, the kind of Tazrim account it fills, the
 * Tazrim provider key (lib/accounts/brands.ts) and the login fields its site asks for.
 *
 * The list itself comes from the library's definitions file, which has no
 * dependencies (not the package root, which loads the browser), so the client
 * can import it.
 */
import type { AccountKind } from '@prisma/client'
import { SCRAPERS, type CompanyTypes } from 'israeli-bank-scrapers/lib/definitions'

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

type CompanyMeta = Omit<SyncCompany, 'id' | 'fields'>

/**
 * What the library doesn't say about each of its companies: the Hebrew name, the
 * kind of account, the Tazrim provider key and how far back it reaches. Keyed by
 * the library's CompanyTypes, so a company a library update adds fails the type
 * check until it is described here. The order is the order the add sheet lists them.
 */
const COMPANY_META: Record<CompanyTypes, CompanyMeta> = {
  leumi: { label: 'בנק לאומי', kind: 'BANK', provider: 'leumi', historyMonths: 36 },
  hapoalim: { label: 'בנק הפועלים', kind: 'BANK', provider: 'hapoalim', historyMonths: 12 },
  discount: { label: 'בנק דיסקונט', kind: 'BANK', provider: 'discount', historyMonths: 12 },
  mizrahi: { label: 'מזרחי טפחות', kind: 'BANK', provider: 'mizrahi', historyMonths: 12 },
  mercantile: { label: 'בנק מרכנתיל', kind: 'BANK', provider: 'mercantile', historyMonths: 12 },
  beinleumi: { label: 'הבנק הבינלאומי', kind: 'BANK', provider: 'beinleumi', historyMonths: 36 },
  otsarHahayal: { label: 'בנק אוצר החייל', kind: 'BANK', provider: 'otsarhahayal', historyMonths: 36 },
  massad: { label: 'בנק מסד', kind: 'BANK', provider: 'massad', historyMonths: 36 },
  pagi: { label: 'בנק פאג"י', kind: 'BANK', provider: 'pagi', historyMonths: 36 },
  yahav: { label: 'בנק יהב', kind: 'BANK', provider: 'yahav', historyMonths: 3 },
  union: { label: 'בנק איגוד', kind: 'BANK', provider: 'union', historyMonths: 12 },
  oneZero: { label: 'וואן זירו', kind: 'BANK', provider: 'onezero', historyMonths: 12, otp: true },
  max: { label: 'מקס', kind: 'CREDIT_CARD', provider: 'max', historyMonths: 48 },
  visaCal: { label: 'כאל', kind: 'CREDIT_CARD', provider: 'cal', historyMonths: 36 },
  isracard: { label: 'ישראכרט', kind: 'CREDIT_CARD', provider: 'isracard', historyMonths: 12 },
  amex: { label: 'אמריקן אקספרס', kind: 'CREDIT_CARD', provider: 'amex', historyMonths: 12 },
  behatsdaa: { label: 'בהצדעה', kind: 'CREDIT_CARD', provider: 'behatsdaa', historyMonths: 12 },
  beyahadBishvilha: { label: 'ביחד בשבילך', kind: 'CREDIT_CARD', provider: 'beyahad', historyMonths: 12 },
}

const LOGIN_FIELDS = new Set<string>(['username', 'userCode', 'id', 'num', 'card6Digits', 'nationalID', 'email', 'phoneNumber', 'password'])

/**
 * Every company israeli-bank-scrapers logs in to, with the login fields the
 * library asks for (minus its OTP hooks, which the sync supplies itself).
 */
export const SYNC_COMPANIES: SyncCompany[] = (Object.keys(COMPANY_META) as CompanyTypes[]).map(id => ({
  id,
  fields: SCRAPERS[id].loginFields.filter((f): f is LoginField => LOGIN_FIELDS.has(f)),
  ...COMPANY_META[id],
}))

/** Companies tried end to end with a real account; the rest say "לא נבדק עדיין". */
export const VERIFIED_COMPANIES = new Set<string>(['visaCal', 'max'])

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
