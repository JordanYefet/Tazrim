/**
 * Network isolation, the app's side of the updater (ENG-133/134; updater/egress.mjs). The updater
 * owns the trusted state and checks every passkey signature; the app only relays. Anything the
 * updater says is reduced to fixed codes and known fields: its English and `detail` stay here.
 */
import { parseConfirm } from '@/lib/updates/compose'
import { helperConfigJob, helperHealth, helperIsReady, runJob } from '@/lib/updates/helper'
import { egressActive } from './config'
import { householdProviderIds } from './household'
import { isProviderId } from './provider-ports'
import { cleanApprovers, cleanChanges, cleanExtras, readChanges, readExtraDomains } from './files'
import { recentDenied } from './squid-log'
import { egressMessage } from './messages'
import type { ChangeRequest, EgressJob, EgressView } from './types'

const INFO_MS = 15_000
const CALL_MS = 30_000

/** The updater's job without its paths and text */
export function safeJob(j: unknown): EgressJob | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (typeof o.id !== 'string' || !Array.isArray(o.steps)) return null
  const state = o.state === 'running' || o.state === 'done' ? o.state : 'failed'
  return {
    id: o.id,
    state,
    restored: o.restored === true,
    steps: (o.steps as { id?: unknown; state?: unknown }[]).map(s => ({
      id: String(s.id),
      state: s.state === 'running' || s.state === 'done' || s.state === 'failed' ? s.state : 'waiting',
    })),
    ...(state === 'failed' ? { code: typeof o.code === 'string' ? o.code : 'APPLY_FAILED' } : {}),
    ...(typeof o.finishedAt === 'string' ? { finishedAt: o.finishedAt } : {}),
    ...(o.restartingHelper === true ? { restartingHelper: true } : {}),
  }
}

/** The page's whole state: the updater's answer where it gives one, the mounted files otherwise */
export async function getEgressView(): Promise<EgressView> {
  const envOn = egressActive()
  const view: EgressView = {
    helper: 'none',
    reason: null,
    on: envOn,
    overrideDiffers: false,
    extraDomains: [],
    household: [],
    approvers: [],
    changes: [],
    blocked: null,
    job: null,
  }
  const health = await helperHealth()
  let fromHelper = false
  if (health) {
    if (!helperIsReady(health)) view.helper = 'old'
    else {
      const [r, configJob] = await Promise.all([runJob('egress-info', {}, { timeoutMs: INFO_MS }), helperConfigJob()])
      const j = r?.status === 200 && r.json && typeof r.json === 'object' ? (r.json as Record<string, unknown>) : null
      if (!j) view.helper = 'unavailable'
      else if (j.available !== true) {
        view.helper = 'unavailable'
        view.reason = typeof j.reason === 'string' ? j.reason : null
      } else {
        view.helper = 'ready'
        fromHelper = true
        view.on = envOn || j.on === true
        view.overrideDiffers = j.overrideDiffers === true
        view.extraDomains = cleanExtras(j.extraDomains)
        view.approvers = cleanApprovers(j.approvers)
        view.changes = cleanChanges(j.changes).slice(0, 50)
        // The settings job's file is shared with settings; it is the isolation switch's when it says so
        const job = configJob && typeof configJob === 'object' && (configJob as { egress?: unknown }).egress ? configJob : null
        view.job = safeJob(job)
      }
    }
  }
  if (!fromHelper && envOn) {
    view.extraDomains = readExtraDomains()
    view.changes = readChanges()
  }
  view.household = await householdProviderIds().catch(() => [])
  if (view.on) view.blocked = recentDenied()
  return view
}

export type Relay = { status: number; body: Record<string, unknown> }

const KEEP = {
  'egress-on': ['job'],
  'egress-register-begin': ['options', 'mode', 'codeFile', 'expiresAt'],
  'egress-register-finish': ['ok', 'approver'],
  'egress-approve-begin': ['flowId', 'options', 'passwordAllowed', 'change', 'bootstrap'],
  'egress-approve-finish': ['ok', 'change', 'job', 'adoptToken', 'adoptOptions'],
} as const satisfies Record<string, readonly string[]>

/** One job run in the updater; its success body keeps only the known fields, a refusal becomes { code, error } in Hebrew */
export async function relay(job: keyof typeof KEEP, body: unknown): Promise<Relay> {
  const r = await runJob(job, body, { timeoutMs: CALL_MS })
  const j = (r?.json && typeof r.json === 'object' ? r.json : {}) as Record<string, unknown>
  const coded = typeof j.error === 'string' && /^[A-Z_]{3,40}$/.test(j.error)
  // No answer, or a token/route the helper doesn't know (an old helper): no helper. A coded refusal (even a 403) is the helper speaking.
  if (!r || ((r.status === 401 || r.status === 403 || r.status === 404) && !coded)) return { status: 503, body: { code: 'NO_HELPER', error: egressMessage('NO_HELPER') } }
  if (r.status >= 200 && r.status < 300) {
    const out: Record<string, unknown> = {}
    for (const k of KEEP[job]) if (k in j) out[k] = k === 'job' ? safeJob(j[k]) : k === 'approver' ? cleanApprovers([j[k]])[0] : j[k]
    return { status: r.status, body: out }
  }
  // The updater's `error` is the code
  const code = typeof j.error === 'string' && /^[A-Z_]{3,40}$/.test(j.error) ? j.error : 'HELPER_ERROR'
  const until = code === 'LOCKED' && typeof j.until === 'string' ? j.until.slice(0, 40) : undefined
  return { status: r.status >= 400 && r.status < 500 ? r.status : 502, body: { code, error: egressMessage(code), ...(until ? { until } : {}) } }
}

/** The provider a change names: its id, null for "all of them" (none given), false for an id that is not one we know */
const providerOf = (v: unknown): string | null | false => (v === undefined || v === null || v === '' ? null : isProviderId(v) ? v : false)

const text = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null)

/** A change as the browser sent it, cut down to the shapes the updater knows; null when it is none of them */
export function parseChange(v: unknown): ChangeRequest | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  switch (c.action) {
    case 'add-domain': {
      const domain = text(c.domain, 253)
      const note = c.note === undefined || c.note === '' ? '' : text(c.note, 200)
      const provider = providerOf(c.provider)
      return domain && note !== null && provider !== false ? { action: 'add-domain', domain, ...(note ? { note } : {}), ...(provider ? { provider } : {}) } : null
    }
    case 'remove-domain': {
      const domain = text(c.domain, 253)
      const provider = providerOf(c.provider)
      return domain && provider !== false ? { action: 'remove-domain', domain, ...(provider ? { provider } : {}) } : null
    }
    case 'turn-off':
      return { action: 'turn-off' }
    case 'remove-approver': {
      const id = text(c.id, 400)
      return id ? { action: 'remove-approver', id } : null
    }
    case 'add-approver':
      return c.kind === 'passkey' || c.kind === 'password' ? { action: 'add-approver', kind: c.kind } : null
    case 'update-compose': {
      const confirm = parseConfirm({ files: c.files })
      const version = text(c.version, 20)
      return confirm && version && /^\d+\.\d+\.\d+$/.test(version) && Object.keys(confirm.files).length ? { action: 'update-compose', version, files: confirm.files } : null
    }
    default:
      return null
  }
}

/** The name a request was opened under, as the updater's rpId: no port, lowercase (the same rule as sign-in) */
export function rpIdOf(headers: Headers): string | null {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase()
  if (!host) return null
  return host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '')
}
