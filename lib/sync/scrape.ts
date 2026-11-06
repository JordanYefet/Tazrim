/**
 * Runs one login-and-fetch against a bank or card company's site with
 * israeli-bank-scrapers (ENG-91). The browser is headless (no window) and
 * starts from a fresh temporary profile, so no cookies or sessions are kept.
 * The login is used for this run only: it is never stored or logged.
 *
 * TAZRIM_FAKE_SYNC=1 swaps the site for made-up data (development, the demo
 * of the flow, tests); TAZRIM_SYNC_SHOW_BROWSER=1 shows the browser window
 * while debugging a login.
 */
import type { ScrapedAccount } from './map'
import type { SyncCompany } from './providers'

export type ScrapeStep = 'starting' | 'logging-in' | 'fetching' | 'done'

export type ScrapeErrorCode = 'INVALID_PASSWORD' | 'CHANGE_PASSWORD' | 'ACCOUNT_BLOCKED' | 'TIMEOUT' | 'OTP' | 'GENERIC'

export type ScrapeResult = { ok: true; accounts: ScrapedAccount[] } | { ok: false; code: ScrapeErrorCode }

export interface ScrapeRequest {
  company: SyncCompany
  credentials: Record<string, string>
  startDate: Date
  onStep: (step: ScrapeStep) => void
  /** Resolves with the SMS code the person types in (companies with `otp`) */
  requestOtp: () => Promise<string>
}

/**
 * The library's reason for a failure, for the server log only: every run of three or
 * more digits masked (card, account and ID numbers, amounts) and cut short, so the
 * log says why without carrying the person's data. Never sent to the page.
 */
export function safeReason(text: unknown): string {
  return String(text ?? '')
    .replace(/\d{3,}/g, '###')
    .replace(/\s+/g, ' ')
    .slice(0, 300)
}

const ERROR_CODES: Record<string, ScrapeErrorCode> = {
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  CHANGE_PASSWORD: 'CHANGE_PASSWORD',
  ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
  TIMEOUT: 'TIMEOUT',
  TWO_FACTOR_RETRIEVER_MISSING: 'OTP',
}

export function scrape(req: ScrapeRequest): Promise<ScrapeResult> {
  return process.env.TAZRIM_FAKE_SYNC === '1' ? fakeScrape(req) : realScrape(req)
}

async function realScrape({ company, credentials, startDate, onStep, requestOtp }: ScrapeRequest): Promise<ScrapeResult> {
  // Loaded on demand: the package pulls in puppeteer, which only the server needs
  const { createScraper } = await import('israeli-bank-scrapers')
  const scraper = createScraper({
    companyId: company.id as Parameters<typeof createScraper>[0]['companyId'],
    startDate,
    combineInstallments: false,
    showBrowser: process.env.TAZRIM_SYNC_SHOW_BROWSER === '1',
    verbose: false,
  })
  scraper.onProgress((_id, { type }) => {
    if (type === 'LOGGING_IN') onStep('logging-in')
    else if (type === 'LOGIN_SUCCESS') onStep('fetching')
  })
  const login: Record<string, unknown> = { ...credentials }
  if (company.otp) login.otpCodeRetriever = requestOtp
  try {
    const result = await scraper.scrape(login as Parameters<typeof scraper.scrape>[0])
    if (!result.success) {
      console.warn(`[sync] ${company.id} failed: ${result.errorType ?? 'unknown'} ${safeReason(result.errorMessage)}`)
      return { ok: false, code: ERROR_CODES[result.errorType ?? ''] ?? 'GENERIC' }
    }
    return { ok: true, accounts: (result.accounts ?? []) as ScrapedAccount[] }
  } catch (e) {
    // The library's own error text can quote the page: only a code leaves this function,
    // and the log gets the reason with its numbers masked
    console.warn(`[sync] ${company.id} threw: ${safeReason(e instanceof Error ? `${e.name}: ${e.message}` : e)}`)
    return { ok: false, code: 'GENERIC' }
  }
}

// The made-up site answers at once under tests
const wait = (ms: number) => new Promise(r => setTimeout(r, process.env.VITEST ? 0 : ms))

/** Made-up accounts in the shape the library returns, a few days back from today. */
async function fakeScrape({ company, credentials, onStep, requestOtp }: ScrapeRequest): Promise<ScrapeResult> {
  onStep('logging-in')
  await wait(1200)
  if (credentials.password === 'wrong') return { ok: false, code: 'INVALID_PASSWORD' }
  if (company.otp) {
    const code = await requestOtp()
    if (code !== '123456') return { ok: false, code: 'OTP' }
  }
  onStep('fetching')
  await wait(1500)
  const day = (back: number) => {
    const d = new Date()
    d.setDate(d.getDate() - back)
    return d.toISOString()
  }
  const billing = new Date()
  billing.setMonth(billing.getMonth() + 1, 2)
  const tx = (back: number, description: string, amount: number, extra: object = {}) => ({
    type: 'normal',
    date: day(back),
    processedDate: company.kind === 'CREDIT_CARD' ? billing.toISOString() : day(back),
    originalAmount: amount,
    originalCurrency: 'ILS',
    chargedAmount: amount,
    description,
    status: 'completed',
    ...extra,
  })
  if (company.kind === 'BANK') {
    return {
      ok: true,
      accounts: [
        {
          accountNumber: '000-000000/00',
          balance: 5432.1,
          txns: [
            tx(6, 'משכורת דמו', 9000, { identifier: 90001 }),
            tx(5, 'סופר דמו', -312.4, { identifier: 90002 }),
            tx(3, 'העברה דמו', -1500, { identifier: 90003 }),
            tx(1, 'קפה דמו', -18, { identifier: 90004 }),
            tx(0, 'בהמתנה דמו', -50, { status: 'pending' }),
          ],
        },
      ],
    }
  }
  return {
    ok: true,
    accounts: [
      {
        accountNumber: '1234',
        txns: [
          tx(7, 'מסעדה דמו', -120),
          tx(4, 'חנות בגדים דמו', -300, { type: 'installments', installments: { number: 1, total: 3 }, chargedAmount: -100 }),
          tx(2, 'מנוי דמו', -39.9, { category: 'פנאי' }),
          tx(0, 'חיוב בהמתנה דמו', -75, { status: 'pending' }),
        ],
      },
      { accountNumber: '5678', txns: [tx(3, 'דלק דמו', -250, { category: 'רכב' })] },
    ],
  }
}
