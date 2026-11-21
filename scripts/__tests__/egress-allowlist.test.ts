import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHARED_HOSTS } from '../../updater/egress-rules.mjs'
import { BANKS_TXT, covers, EGRESS_COMPOSE, entries, loadAllowlist, render, renderCompose, SQUID_CONF } from '../egress-allowlist.mjs'

// ENG-131: what the tazrim container may reach through Squid. docker/squid/allowlist.json is the
// source of truth; banks.txt is generated from it. These tests are the guard for a scraper upgrade.
interface Allowlist {
  providers: Record<string, { name: string; domains: string[]; thirdParty: { domain: string; why?: string }[] }>
}
const list = loadAllowlist() as Allowlist
const banks = BANKS_TXT as string
const all = entries(list) as { id: string; domain: string }[]

/** The entries banks.txt really holds (comments and blank lines dropped) */
const listed = () =>
  fs
    .readFileSync(banks, 'utf8')
    .split('\n')
    .map(l => l.replace(/#.*/, '').trim())
    .filter(Boolean)

describe('Squid allowlist', () => {
  it('has every company of the installed israeli-bank-scrapers (a new provider must be allowlisted before the upgrade ships)', async () => {
    const { CompanyTypes } = await import('israeli-bank-scrapers')
    const wanted = Object.values(CompanyTypes as Record<string, string>).sort()
    const missing = wanted.filter(id => !list.providers[id])
    expect(missing, `add ${missing.join(', ')} to docker/squid/allowlist.json (re-run scripts/egress-survey.mjs), then node scripts/egress-allowlist.mjs`).toEqual([])
    // and nothing left behind for a provider the scraper dropped
    expect(Object.keys(list.providers).sort()).toEqual(wanted)
  })

  it('gives every provider at least one domain of its own', () => {
    for (const [id, p] of Object.entries(list.providers)) {
      expect(p.domains.length, id).toBeGreaterThan(0)
      expect(p.name, id).toBeTruthy()
    }
  })

  it('has only well-formed lower-case host names, no wildcards or schemes', () => {
    for (const e of all) expect(e.domain, `${e.id}: ${e.domain}`).toMatch(/^\.?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)
  })

  it('never allows a broad shared host that code could send data to', () => {
    const banned = SHARED_HOSTS as readonly string[]
    for (const e of all) {
      const bare = e.domain.replace(/^\./, '')
      const hit = banned.find(b => bare === b || bare.endsWith(`.${b}`))
      expect(hit, `${e.id}: ${e.domain} is too broad / lets data out (${hit})`).toBeUndefined()
    }
  })

  it('gives every third-party host a reason', () => {
    for (const p of Object.values(list.providers)) for (const t of p.thirdParty) expect(t.why, t.domain).toBeTruthy()
  })

  it('banks.txt is what allowlist.json renders to (run node scripts/egress-allowlist.mjs)', () => {
    expect(fs.readFileSync(banks, 'utf8')).toBe(render(list))
  })

  it('banks.txt has no entry a broader one covers (Squid would warn and ignore it)', () => {
    const lines = listed()
    expect(new Set(lines).size).toBe(lines.length)
    for (const a of lines) for (const b of lines) if (a !== b) expect(covers(a, b), `${a} covers ${b}`).toBe(false)
  })

  it('every domain in allowlist.json is in banks.txt, directly or under a broader entry', () => {
    const lines = listed()
    for (const e of all) expect(lines.some(l => covers(l, e.domain)), `${e.id}: ${e.domain}`).toBe(true)
  })

  it('squid.conf reads the list from banks.txt', () => {
    const conf = fs.readFileSync(path.join(path.dirname(banks), 'squid.conf'), 'utf8')
    expect(conf).toMatch(/^acl banks\s+dstdomain "\/etc\/squid\/banks\.txt"/m)
    expect(conf).toMatch(/^acl extra\s+dstdomain "\/etc\/squid\/extra\/extra-domains\.txt"/m)
    expect(conf).toMatch(/^umask 022$/m)
  })

  it('docker-compose.egress.yml carries current copies of squid.conf and banks.txt (run node scripts/egress-allowlist.mjs)', () => {
    const compose = fs.readFileSync(EGRESS_COMPOSE as string, 'utf8')
    expect(renderCompose(compose, fs.readFileSync(SQUID_CONF as string, 'utf8'), fs.readFileSync(banks, 'utf8'))).toBe(compose)
  })

  it('squid.conf is shipped enforcing: learning mode is a commented-out line, nothing allows everything', () => {
    const conf = fs.readFileSync(SQUID_CONF as string, 'utf8')
    const rules = conf.split('\n').filter(l => /^\s*http_access\s/.test(l))
    expect(rules.at(-1)).toBe('http_access deny all')
    expect(rules.filter(l => /allow/.test(l))).toEqual(['http_access allow from_app banks', 'http_access allow from_app extra', 'http_access allow from_updater github'])
    expect(conf).toMatch(/^#http_access allow from_app$/m)
  })
})
