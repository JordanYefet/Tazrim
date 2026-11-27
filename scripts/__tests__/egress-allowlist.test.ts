import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHARED_HOSTS } from '../../updater/egress-rules.mjs'
import { providerEntries, renderProviderTxt } from '../../updater/egress-rules.mjs'
import { BANKS_TXT, confBlocks, covers, EGRESS_COMPOSE, entries, INIT_SH, loadAllowlist, MAIN_PORT, ports, render, renderCompose, renderConf, SQUID_CONF } from '../egress-allowlist.mjs'

// ENG-131: what the tazrim container may reach through Squid. docker/squid/allowlist.json is the
// source of truth; banks.txt is generated from it. These tests are the guard for a scraper upgrade.
interface Allowlist {
  providers: Record<string, { name: string; port: number; domains: string[]; thirdParty: { domain: string; why?: string }[] }>
}
const list = loadAllowlist() as Allowlist
const banks = BANKS_TXT as string
const all = entries(list) as { id: string; domain: string }[]

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

  it('banks.txt has, in each provider section, no entry a broader one of that section covers (Squid would warn and ignore it)', () => {
    const sections = fs.readFileSync(banks, 'utf8').split(/^# --- /m).slice(1)
    expect(sections).toHaveLength(Object.keys(list.providers).length)
    for (const s of sections) {
      const lines = s.split('\n').slice(1).map(l => l.replace(/#.*/, '').trim()).filter(Boolean)
      expect(new Set(lines).size, s).toBe(lines.length)
      for (const a of lines) for (const b of lines) if (a !== b) expect(covers(a, b), `${a} covers ${b}`).toBe(false)
    }
  })

  it('every provider keeps ALL its own domains in its section, even one another provider also lists (Discount and Mercantile)', () => {
    for (const [id, p] of Object.entries(list.providers)) {
      const mine = providerEntries(p).map((e: { domain: string }) => e.domain)
      const text = renderProviderTxt(id, p, true)
      for (const d of [...p.domains, ...p.thirdParty.map(t => t.domain)]) expect(mine.some((m: string) => covers(m, d)), `${id}: ${d}`).toBe(true)
      for (const d of mine) expect(text).toContain(`\n${d}\n`)
    }
    expect(fs.readFileSync(banks, 'utf8')).toMatch(/# --- mercantile: .*\n\.telebank\.co\.il\n/)
  })

  it('a provider that is not in use renders to a file with no domain at all', () => {
    const text = renderProviderTxt('leumi', list.providers.leumi, false)
    expect(text.split('\n').filter(l => l.trim() && !l.startsWith('#'))).toEqual([])
  })

  it('gives every provider its own port: unique, in 3201 and up, never the main port, and stable (a number is never reused)', () => {
    const all = ports(list) as { id: string; port: number }[]
    const numbers = all.map(p => p.port)
    expect(new Set(numbers).size).toBe(numbers.length)
    for (const p of numbers) {
      expect(Number.isInteger(p)).toBe(true)
      expect(p).toBeGreaterThanOrEqual(3201)
      expect(p).toBeLessThan(3300)
      expect(p).not.toBe(MAIN_PORT)
    }
    // Pinned: a port that was shipped never moves to another provider, and a new provider takes a number no one had
    expect(Object.fromEntries(all.map(p => [p.id, p.port]))).toMatchObject({
      hapoalim: 3201, beinleumi: 3202, union: 3203, amex: 3204, isracard: 3205, visaCal: 3206, max: 3207, otsarHahayal: 3208,
      discount: 3209, mercantile: 3210, mizrahi: 3211, leumi: 3212, massad: 3213, yahav: 3214, behatsdaa: 3215, beyahadBishvilha: 3216,
      oneZero: 3217, pagi: 3218,
    })
  })

  it('squid.conf: its generated blocks are what allowlist.json renders to, and every provider has a port, lists and two rules on its port and on the main one', () => {
    const conf = fs.readFileSync(SQUID_CONF as string, 'utf8')
    expect(renderConf(conf, list)).toBe(conf)
    const blocks = confBlocks(list) as { ports: string[]; acls: string[]; rules: string[] }
    for (const { id, port } of ports(list) as { id: string; port: number }[]) {
      expect(conf).toContain(`http_port ${port} name=p_${id}\n`)
      expect(conf).toContain(`acl dst_${id} dstdomain "/etc/squid/extra/providers/${id}.txt"\n`)
      expect(conf).toContain(`acl extra_${id} dstdomain "/etc/squid/extra/providers/extra-${id}.txt"\n`)
      expect(conf).toContain(`http_access allow from_app via_${id} dst_${id}\n`)
      expect(conf).toContain(`http_access allow from_app via_${id} extra_${id}\n`)
      expect(conf).toContain(`http_access allow from_app via_main dst_${id}\n`)
    }
    expect(blocks.ports[0]).toBe('http_port 3128 name=p_main')
    // A provider's port reaches ONLY its own lists: no rule mixes one port with another provider's acl
    for (const r of blocks.rules.slice(0, 2 * Object.keys(list.providers).length)) {
      const m = /via_(\w+) (?:dst|extra)_(\w+)$/.exec(r)
      expect(m?.[1], r).toBe(m?.[2])
    }
  })

  it('squid.conf reads the owner\'s additions and logs the port of every line', () => {
    const conf = fs.readFileSync(SQUID_CONF as string, 'utf8')
    expect(conf).toMatch(/^acl extra\s+dstdomain "\/etc\/squid\/extra\/extra-domains\.txt"/m)
    expect(conf).toMatch(/^logformat tazrim .* %mt %lp$/m)
    expect(conf).toMatch(/^access_log daemon:\/var\/log\/squid\/access\.log tazrim$/m)
    expect(conf).toMatch(/^umask 022$/m)
  })

  it('docker-compose.egress.yml carries current copies of squid.conf, banks.txt and init.sh (run node scripts/egress-allowlist.mjs)', () => {
    const compose = fs.readFileSync(EGRESS_COMPOSE as string, 'utf8')
    expect(renderCompose(compose, fs.readFileSync(SQUID_CONF as string, 'utf8'), fs.readFileSync(banks, 'utf8'), fs.readFileSync(INIT_SH as string, 'utf8'))).toBe(compose)
  })

  it('the Squid wrapper starts a missing provider file FULL from banks.txt and only then hands over to the image', () => {
    const init = fs.readFileSync(INIT_SH as string, 'utf8')
    expect(init).toContain('/etc/squid/banks.txt')
    expect(init).toMatch(/\[ -e "\$P\/\$id\.txt" \] \|\| cp /)
    expect(init).toMatch(/^exec entrypoint\.sh "\$@"$/m)
  })

  it('squid.conf is shipped enforcing: learning mode is a commented-out line, nothing allows everything', () => {
    const conf = fs.readFileSync(SQUID_CONF as string, 'utf8')
    const rules = conf.split('\n').filter(l => /^\s*http_access\s/.test(l))
    expect(rules.at(-1)).toBe('http_access deny all')
    const allows = rules.filter(l => /allow/.test(l))
    expect(allows[0]).toBe('http_access allow from_app extra')
    expect(allows.at(-1)).toBe('http_access allow from_updater github')
    // everything between them is generated, and names a provider's own port with its own lists (or the main port)
    for (const l of allows.slice(1, -1)) expect(l).toMatch(/^http_access allow from_app via_(main|\w+) (dst|extra)_\w+$/)
    expect(conf).toMatch(/^#http_access allow from_app$/m)
  })
})
