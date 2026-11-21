/**
 * The allowlist survey (ENG-131): which hosts does each provider's LOGIN PAGE contact?
 *
 * For every provider it opens the login page(s) in headless Chromium (puppeteer, the same one the
 * bank scraper uses), through a Squid that allows and logs everything, waits for the network to
 * go quiet, and reads what Squid saw. Nothing is typed and nobody logs in: this only learns the
 * hosts a page loads BEFORE login (CDN, fonts, captcha, analytics). Hosts used after login can
 * only be learned with a real account: run the real Squid in LEARNING MODE (docker/squid/squid.conf).
 *
 *   docker compose -f docker/squid/survey.compose.yml up -d
 *   node scripts/egress-survey.mjs [--only max,leumi] [--json out.json] [--md out.md]
 *   docker compose -f docker/squid/survey.compose.yml down
 *
 * Squid's access.log is the truth (it is what the tazrim container will meet); Chromium's own
 * request events are recorded too, to catch anything Squid did not log.
 *
 * Re-run it when israeli-bank-scrapers is upgraded, then update docker/squid/allowlist.json
 * (docs/development.md, the pinned scraper). Login pages change; so does what they load.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import puppeteer from 'puppeteer'
import { loadAllowlist, covers } from './egress-allowlist.mjs'

/** Login pages, from israeli-bank-scrapers 6.13.0 (lib/scrapers/*.js). More than one: every page the scraper visits before login. */
export const LOGIN_PAGES = {
  hapoalim: ['https://login.bankhapoalim.co.il/cgi-bin/poalwwwc?reqName=getLogonPage'],
  beinleumi: ['https://online.fibi.co.il/MatafLoginService/MatafLoginServlet?bankId=FIBIPORTAL&site=Private&KODSAFA=HE'],
  union: ['https://hb.unionbank.co.il'],
  amex: ['https://he.americanexpress.co.il/personalarea/Login'],
  isracard: ['https://digital.isracard.co.il/personalarea/Login'],
  visaCal: ['https://www.cal-online.co.il/'],
  max: ['https://www.max.co.il/login'],
  otsarHahayal: ['https://online.bankotsar.co.il/MatafLoginService/MatafLoginServlet?bankId=OTSARPRTAL&site=Private&KODSAFA=HE'],
  discount: ['https://start.telebank.co.il/login/#/LOGIN_PAGE'],
  mercantile: ['https://start.telebank.co.il/login/?bank=m'],
  mizrahi: ['https://www.mizrahi-tefahot.co.il/login/index.html#/auth-page-he'],
  leumi: ['https://www.leumi.co.il/he', 'https://hb2.bankleumi.co.il/authenticate/logon'],
  massad: ['https://online.bankmassad.co.il/MatafLoginService/MatafLoginServlet?bankId=MASADPRTAL&site=Private&KODSAFA=HE'],
  yahav: ['https://login.yahav.co.il/login/'],
  behatsdaa: ['https://www.behatsdaa.org.il/login'],
  beyahadBishvilha: ['https://www.hist.org.il/login'],
  // No page: the scraper only calls these APIs with fetch (no browser). The survey just touches the hosts.
  oneZero: ['https://identity.tfd-bank.com/', 'https://mobile.tfd-bank.com/'],
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
// --proxy none: no Squid, Chromium goes out directly and only its own request events are used
// (the fallback when no Squid can be run; Squid's log stays the preferred truth)
const PROXY = arg('proxy', 'http://127.0.0.1:3129')
const DIRECT = PROXY === 'none'
const SQUID = arg('squid-container', 'squid-survey')
const ONLY = arg('only', '')?.split(',').filter(Boolean)
const NAV_TIMEOUT = Number(arg('timeout', '45000'))
const SETTLE_MS = Number(arg('settle', '5000'))

const squidLog = () => DIRECT ? [] : execFileSync('docker', ['exec', SQUID, 'cat', '/var/log/squid/access.log'], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean)

/** Host of a Squid log line: the URL column is "host:443" for CONNECT, a full URL for plain http */
function hostOf(line) {
  const f = line.trim().split(/\s+/)
  const [method, url] = [f[5], f[6]]
  if (!url) return null
  if (method === 'CONNECT') return url.replace(/:\d+$/, '').toLowerCase()
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

const list = loadAllowlist()
const owned = (id, host) => list.providers[id].domains.some(d => covers(d, host))

async function surveyProvider(browser, id, urls) {
  const before = squidLog().length
  const seenByChrome = new Map()
  const pages = []
  for (const url of urls) {
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    page.on('request', r => {
      try {
        const h = new URL(r.url()).hostname.toLowerCase()
        if (h) seenByChrome.set(h, (seenByChrome.get(h) ?? 0) + 1)
      } catch {}
    })
    let result = 'loaded'
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
    } catch (e) {
      // A timeout is common with trackers that never go quiet: what loaded so far still counts
      result = /timeout/i.test(String(e)) ? 'timeout (partial)' : `failed: ${String(e.message ?? e).split('\n')[0].slice(0, 80)}`
    }
    await new Promise(r => setTimeout(r, SETTLE_MS))
    pages.push({ url, result, title: await page.title().catch(() => '') })
    await ctx.close()
  }
  const lines = squidLog().slice(before)
  const hosts = new Map()
  for (const l of lines) {
    const h = hostOf(l)
    if (!h) continue
    const status = l.trim().split(/\s+/)[3]
    const e = hosts.get(h) ?? { host: h, requests: 0, ok: 0 }
    e.requests++
    if (/\/(2\d\d|3\d\d)$/.test(status) || /TUNNEL\/200/.test(status)) e.ok++
    hosts.set(h, e)
  }
  if (DIRECT) for (const [host, n] of seenByChrome) hosts.set(host, { host, requests: n, ok: n })
  const rows = [...hosts.values()]
    .map(e => ({ ...e, owner: owned(id, e.host) ? 'own' : 'third-party' }))
    .sort((a, b) => (a.owner === b.owner ? a.host.localeCompare(b.host) : a.owner === 'own' ? -1 : 1))
  const missedBySquid = [...seenByChrome.keys()].filter(h => !hosts.has(h))
  return { id, pages, hosts: rows, chromeOnly: missedBySquid }
}

async function main() {
  const ids = Object.keys(LOGIN_PAGES).filter(id => !ONLY?.length || ONLY.includes(id))
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [...(DIRECT ? [] : [`--proxy-server=${PROXY}`]), '--no-first-run', '--disable-dev-shm-usage'],
  })
  const results = []
  try {
    for (const id of ids) {
      process.stderr.write(`surveying ${id} ...\n`)
      results.push(await surveyProvider(browser, id, LOGIN_PAGES[id]))
    }
  } finally {
    await browser.close()
  }

  const md = ['# Egress survey: hosts each provider login page contacted', '']
  for (const r of results) {
    md.push(`## ${r.id}`, '')
    for (const p of r.pages) md.push(`- ${p.url} -> ${p.result}${p.title ? ` ("${p.title}")` : ''}`)
    md.push('', `| host | owner | requests | ${DIRECT ? 'seen by' : 'tunnelled ok'} |`, '|---|---|---|---|')
    for (const h of r.hosts) md.push(`| ${h.host} | ${h.owner} | ${h.requests} | ${h.ok} |`)
    if (r.chromeOnly.length) md.push('', `Chromium saw but Squid did not log: ${r.chromeOnly.join(', ')}`)
    md.push('')
  }
  const out = md.join('\n')
  const mdFile = arg('md')
  if (mdFile) fs.writeFileSync(mdFile, out)
  const jsonFile = arg('json')
  if (jsonFile) fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2))
  console.log(out)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
