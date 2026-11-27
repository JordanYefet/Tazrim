/**
 * Runs one login-and-fetch against a bank or card company's site with
 * israeli-bank-scrapers (ENG-91). The browser is headless (no window) and
 * starts from a fresh temporary profile, so no cookies or sessions are kept.
 * The login is used for this run only: it is never stored or logged.
 *
 * Behind the egress proxy each company's browser uses that company's own port (providerProxyArgs).
 *
 * TAZRIM_FAKE_SYNC=1 swaps the site for made-up data (development, the demo
 * of the flow, tests); TAZRIM_SYNC_SHOW_BROWSER=1 shows the browser window
 * while debugging a login.
 *
 * In dev the browser is puppeteer's own download. The Docker image has none:
 * it sets PUPPETEER_EXECUTABLE_PATH to Debian's Chromium and TAZRIM_CHROMIUM_ARGS
 * to the flags it needs in a container (ENG-100, see the Dockerfile).
 */
import type { ScrapedAccount } from './map'
import type { SyncCompany } from './providers'
import { redact } from '@/lib/log/redact'
import { showSyncBrowser } from '@/lib/log/browser-flag'
import { log } from '@/lib/log/logger'
import { MAIN_PORT, portOfProvider } from '@/lib/egress/provider-ports'
import { pushHouseholdProviders } from '@/lib/egress/household'

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
  /** The run's short number in the debug log (lib/log), which its lines carry */
  runNo?: number
}

/**
 * The library's reason for a failure, for the server log only: every run of three or
 * more digits masked (card, account and ID numbers, amounts; then everything lib/log/redact.ts knows) and cut short, so the
 * log says why without carrying the person's data. Never sent to the page.
 */
export function safeReason(text: unknown): string {
  // Digits first, as before (the same ### for every number), then everything else redact knows
  return redact(String(text ?? '').replace(/\d{3,}/g, '###'))
    .replace(/\s+/g, ' ')
    .slice(0, 300)
}

/** TAZRIM_CHROMIUM_ARGS split on whitespace: extra browser flags, e.g. `--no-sandbox --disable-dev-shm-usage`. */
export function chromiumArgs(value: string | undefined): string[] {
  return (value ?? '').split(/\s+/).filter(Boolean)
}

/**
 * TAZRIM_SYNC_PROXY (e.g. http://squid:3128): the browser's only way out when the install runs
 * behind the egress proxy (compose profile/override "egress", docker/squid/). Becomes
 * `--proxy-server=<it>`; nothing else changes. Only an http(s)://host[:port] is accepted, anything
 * else is ignored (a typo must not turn into some other browser flag).
 */
export function syncProxyArgs(value: string | undefined): string[] {
  const v = (value ?? '').trim()
  return /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?\/?$/.test(v) ? [`--proxy-server=${v.replace(/\/$/, '')}`] : []
}

/**
 * The browser of one company behind the proxy (ENG-142): the same address, on that company's own
 * Squid port, so the proxy lets it reach that company's sites and nothing else. Only a proxy on the
 * default port (our Squid, TAZRIM_SYNC_PROXY=http://squid:3128) is moved; any other address is the
 * person's own proxy and stays as it is. Without TAZRIM_SYNC_PROXY: nothing.
 */
export function providerProxyArgs(value: string | undefined, companyId: string): string[] {
  const args = syncProxyArgs(value)
  const port = portOfProvider(companyId)
  if (!args.length || port === null) return args
  const url = new URL(args[0].slice('--proxy-server='.length))
  if (url.port !== String(MAIN_PORT)) return args
  url.port = String(port)
  return [`--proxy-server=${url.origin}`]
}

/**
 * Chrome's own background traffic, off for the sync browser when it runs behind the proxy (ENG-142): the
 * production proxy log showed it asking for update, autofill, sign-in and password-leak servers
 * that no login needs, all refused. The library's launcher (puppeteer) already passes
 * --disable-background-networking, --disable-sync, --disable-client-side-phishing-detection and
 * --disable-features=Translate,MediaRouter,OptimizationHints; these are the ones it leaves on.
 * (puppeteer merges every --disable-features it is given into one list.) Nothing without a proxy.
 */
export function quietBrowserArgs(proxy: string | undefined): string[] {
  if (!syncProxyArgs(proxy).length) return []
  return ['--disable-component-update', '--no-pings', '--disable-domain-reliability', '--no-default-browser-check', '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate']
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

async function realScrape({ company, credentials, startDate, onStep, requestOtp, runNo }: ScrapeRequest): Promise<ScrapeResult> {
  // Loaded on demand: the package pulls in puppeteer, which only the server needs
  const { createScraper } = await import('israeli-bank-scrapers')
  // Behind the proxy: this company's port must list its domains (the household's providers go to the updater first; ENG-142)
  if (syncProxyArgs(process.env.TAZRIM_SYNC_PROXY).length) await pushHouseholdProviders({ include: [company.id] })
  const scraper = createScraper({
    companyId: company.id as Parameters<typeof createScraper>[0]['companyId'],
    startDate,
    combineInstallments: false,
    showBrowser: showSyncBrowser(),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [...chromiumArgs(process.env.TAZRIM_CHROMIUM_ARGS), ...providerProxyArgs(process.env.TAZRIM_SYNC_PROXY, company.id), ...quietBrowserArgs(process.env.TAZRIM_SYNC_PROXY)],
    verbose: false,
  })
  scraper.onProgress((_id, { type }) => {
    // The library's own progress type, a fixed word (never the page's text)
    const bad = type === 'LOGIN_FAILED' || type === 'CHANGE_PASSWORD'
    log[bad ? 'warn' : 'info']('sync', `${company.id} · ${type}`, { run: runNo, step: type })
    if (type === 'LOGGING_IN') onStep('logging-in')
    else if (type === 'LOGIN_SUCCESS') onStep('fetching')
  })
  const login: Record<string, unknown> = { ...credentials }
  if (company.otp) login.otpCodeRetriever = requestOtp
  try {
    const result = await scraper.scrape(login as Parameters<typeof scraper.scrape>[0])
    if (!result.success) {
      // The run's error line (lib/sync/runs.ts) carries the code; the library's reason, its numbers masked,
      // is a debug line and, as before, in the server console
      const reason = safeReason(result.errorMessage)
      log.debug('sync', `${company.id} · library said ${result.errorType ?? 'unknown'}: ${reason}`, { run: runNo })
      console.warn(`[sync] ${company.id} failed: ${result.errorType ?? 'unknown'} ${reason}`)
      return { ok: false, code: ERROR_CODES[result.errorType ?? ''] ?? 'GENERIC' }
    }
    return { ok: true, accounts: (result.accounts ?? []) as ScrapedAccount[] }
  } catch (e) {
    // The library's own error text can quote the page: only a code leaves this function,
    // and the log gets the reason with its numbers masked
    const reason = safeReason(e instanceof Error ? `${e.name}: ${e.message}` : e)
    log.debug('sync', `${company.id} · threw ${reason}`, { run: runNo })
    console.warn(`[sync] ${company.id} threw: ${reason}`)
    return { ok: false, code: 'GENERIC' }
  }
}

// The made-up site answers at once under tests
const wait = (ms: number) => new Promise(r => setTimeout(r, process.env.VITEST ? 0 : ms))

/** Made-up accounts in the shape the library returns, a few days back from today. */
async function fakeScrape({ company, credentials, onStep, requestOtp, runNo }: ScrapeRequest): Promise<ScrapeResult> {
  log.info('sync', `${company.id} · LOGGING_IN`, { run: runNo, step: 'LOGGING_IN' })
  onStep('logging-in')
  await wait(1200)
  if (credentials.password === 'wrong') {
    log.warn('sync', `${company.id} · LOGIN_FAILED`, { run: runNo, step: 'LOGIN_FAILED' })
    return { ok: false, code: 'INVALID_PASSWORD' }
  }
  if (company.otp) {
    const code = await requestOtp()
    if (code !== '123456') return { ok: false, code: 'OTP' }
  }
  log.info('sync', `${company.id} · LOGIN_SUCCESS`, { run: runNo, step: 'LOGIN_SUCCESS' })
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
            tx(5, 'סופר דמו', -312.4, { identifier: 90002, memo: 'הערה דמו' }),
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
          tx(7, 'מסעדה דמו', -120, { identifier: 80001, memo: 'הערה דמו' }),
          tx(4, 'חנות בגדים דמו', -300, { type: 'installments', installments: { number: 1, total: 3 }, chargedAmount: -100 }),
          tx(2, 'מנוי דמו', -39.9, { category: 'פנאי' }),
          tx(0, 'חיוב בהמתנה דמו', -75, { status: 'pending' }),
        ],
      },
      { accountNumber: '5678', txns: [tx(3, 'דלק דמו', -250, { category: 'רכב' })] },
    ],
  }
}
