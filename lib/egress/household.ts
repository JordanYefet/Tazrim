/**
 * The household's providers, and telling the updater (ENG-142). Each scraper company has its own
 * Squid port and its own allowlist; the list of a company the household has no account with is
 * empty, so its port refuses everything. Only the updater can write those lists, so this tells it
 * which companies the accounts need: `POST /v1/egress/providers { ids }` (the job egress-providers),
 * with the helper's token and no approval.
 *
 * Why no approval: the updater checks every id against its own bundled allowlist and answers with
 * the shipped lists of exactly those, so even an app that claims every provider only gets back the
 * full default list (the reach isolation had before). It can never name a domain. Fewer providers is
 * tightening, which never needs an approval either (turning isolation on doesn't).
 *
 * When it runs: on server start (retried until the helper answers), whenever an account is created,
 * archived, restored, deleted or changes provider (lib/db/accounts.ts), and at the start of each
 * sync (a cheap no-op while nothing changed). It never throws and never blocks a sync for long.
 */
import { prisma } from '@/lib/db/client'
import { isReadOnly } from '@/lib/read-only'
import { companyForAccount } from '@/lib/sync/providers'
import { runJob } from '@/lib/updates/helper'
import { egressActive } from './config'
import { isProviderId } from './provider-ports'

/** The companies the household's accounts sync through: not archived (ENG-102), bank or card, with a known provider. In the order of the sync sheet */
export async function householdProviderIds(): Promise<string[]> {
  const accounts = await prisma.account.findMany({
    where: { archived: false, kind: { in: ['BANK', 'CREDIT_CARD'] } },
    select: { kind: true, provider: true },
  })
  const ids = new Set<string>()
  for (const a of accounts) {
    const company = companyForAccount(a.kind, a.provider)
    if (company && isProviderId(company.id)) ids.add(company.id)
  }
  return [...ids].sort()
}

const CALL_MS = 20_000
/** What the updater was last told, and when: an unchanged household is not asked again for a while */
const RECHECK_MS = 10 * 60_000

interface State {
  sent: { key: string; at: number } | null
  inflight: Promise<boolean> | null
}
const KEY = Symbol.for('tazrim.egress.household')
const g = globalThis as unknown as Record<symbol, State>
const state: State = (g[KEY] ??= { sent: null, inflight: null })

/**
 * Tells the updater the household's providers (plus `include`, e.g. the company a sync is about to
 * start). Resolves true when the updater has them (or already had them), false when it could not be
 * reached or refused. Nothing happens without isolation or in the read-only demo.
 * `force` asks again even when nothing changed since the last answer.
 */
export function pushHouseholdProviders({ force = false, include = [] }: { force?: boolean; include?: string[] } = {}): Promise<boolean> {
  if (!egressActive() || isReadOnly()) return Promise.resolve(true)
  // One call at a time; a second wanted while one runs waits for it, then asks again (the household may have changed since)
  const run = async (): Promise<boolean> => {
    try {
      const ids = [...new Set([...(await householdProviderIds()), ...include.filter(isProviderId)])].sort()
      const key = ids.join(',')
      if (!force && state.sent?.key === key && Date.now() - state.sent.at < RECHECK_MS) return true
      const r = await runJob('egress-providers', { ids }, { timeoutMs: CALL_MS })
      if (r?.status === 200) {
        state.sent = { key, at: Date.now() }
        return true
      }
      state.sent = null
      return false
    } catch {
      state.sent = null
      return false
    }
  }
  const after = state.inflight ?? Promise.resolve(true)
  const next = after.then(run, run)
  const tracked = next.finally(() => {
    if (state.inflight === tracked) state.inflight = null
  })
  state.inflight = tracked
  return tracked
}

/** An account was created, archived, restored, deleted or got another provider: tell the updater, in the background */
export function householdChanged(): void {
  if (!egressActive()) return
  void pushHouseholdProviders({ force: true }).catch(() => {})
}

/** For the server start: tries now and again after 10 s, 1 min and 5 min until the helper has answered */
export function startHouseholdSync(delaysMs: number[] = [0, 10_000, 60_000, 5 * 60_000]): void {
  if (!egressActive() || isReadOnly()) return
  const attempt = (i: number) => {
    const timer = setTimeout(() => {
      void pushHouseholdProviders({ force: true }).then(ok => {
        if (!ok && i + 1 < delaysMs.length) attempt(i + 1)
      })
    }, Math.max(0, delaysMs[i] - (i > 0 ? delaysMs[i - 1] : 0)))
    timer.unref?.()
  }
  attempt(0)
}
