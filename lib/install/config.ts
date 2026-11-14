/**
 * Container-level settings, the app's side (ENG-121): asks the updater helper (updater/config.mjs)
 * for the install's `.env` values and to change them. Without a helper that can, the values are
 * the ones compose passed in for display (docker-compose.yml), and the page shows manual steps.
 */
import { CONFIG_DEFAULTS, effectiveValues, validateChanges } from '@/updater/env-file.mjs'
import { helperCall, helperHealth } from '@/lib/updates/helper'
import type { ConfigChanges, ConfigJob, ConfigKey, ConfigValues, InstallView } from './types'
import { CONFIG_KEY_LIST } from './types'

/** What the app was started with (compose passes these for display; COMPOSE_PROFILES as TAZRIM_PROFILES) */
function envValues(): ConfigValues {
  const env = process.env
  return effectiveValues({
    TAZRIM_PORT: env.TAZRIM_PORT || null,
    TAZRIM_PHONE_PORT: env.TAZRIM_PHONE_PORT || null,
    COMPOSE_PROFILES: env.TAZRIM_PROFILES ?? '',
    TAZRIM_LAN_IP: env.TAZRIM_LAN_IP ?? '',
    TAZRIM_HOST: env.TAZRIM_HOST || null,
    TAZRIM_DNS_HOST: env.TAZRIM_DNS_HOST || null,
    TAZRIM_DNS_BIND: env.TAZRIM_DNS_BIND || null,
  }) as ConfigValues
}

type FileValues = Record<ConfigKey, string | null>

/** Only the keys we know, as strings or null */
function cleanValues(v: unknown): FileValues {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return Object.fromEntries(CONFIG_KEY_LIST.map(k => [k, typeof o[k] === 'string' ? o[k] : null])) as FileValues
}

/** The helper's job without its paths and English text */
function safeJob(j: unknown): ConfigJob | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (o.kind !== 'config' || typeof o.id !== 'string' || !Array.isArray(o.steps)) return null
  const keys = Object.keys((o.changes as object) ?? {}).filter((k): k is ConfigKey => (CONFIG_KEY_LIST as readonly string[]).includes(k))
  const state = o.state === 'running' || o.state === 'done' ? o.state : 'failed'
  return {
    id: o.id,
    state,
    restored: o.restored === true,
    keys,
    steps: (o.steps as ConfigJob['steps']).map(s => ({ id: s.id, state: s.state })),
    ...(state === 'failed' ? { code: o.restored === true ? (typeof o.code === 'string' ? o.code : 'APPLY_FAILED') : o.code === 'WRITE_FAILED' ? 'WRITE_FAILED' : 'NOT_RESTORED' } : {}),
    ...(typeof o.finishedAt === 'string' ? { finishedAt: o.finishedAt } : {}),
  }
}

/** The settings page's whole state */
export async function getInstallView(): Promise<InstallView> {
  const fallback: InstallView = { helper: 'none', reason: null, values: envValues(), fileValues: null, installDir: null, job: null }
  const health = await helperHealth()
  if (!health) return fallback
  if (!health.features?.includes('config')) return { ...fallback, helper: 'old' }
  const [info, status] = await Promise.all([helperCall('GET', '/v1/config', { timeoutMs: 5000 }), helperCall('GET', '/v1/status?kind=config', { timeoutMs: 2000 })])
  const job = status?.status === 200 ? safeJob(status.json) : null
  const j = info?.status === 200 ? (info.json as { available?: unknown; reason?: unknown; values?: unknown; installDir?: unknown }) : null
  if (!j) return { ...fallback, helper: 'unavailable', reason: 'HELPER_ERROR', job }
  if (j.available !== true) return { ...fallback, helper: 'unavailable', reason: typeof j.reason === 'string' ? j.reason : 'HELPER_ERROR', job }
  const fileValues = cleanValues(j.values)
  return {
    helper: 'ready',
    reason: null,
    values: effectiveValues(fileValues) as ConfigValues,
    fileValues,
    installDir: typeof j.installDir === 'string' ? j.installDir : null,
    job,
  }
}

export type StartResult = { status: 202; job: ConfigJob | null } | { status: number; code: string; key?: ConfigKey }

/** Checks here first (same rules as the helper), then asks the helper to apply */
export async function startConfigChange(changes: unknown, fileValues: FileValues | null): Promise<StartResult> {
  const v = validateChanges(changes, fileValues ?? {})
  if (!v.ok) return { status: 400, code: v.code, ...(v.key ? { key: v.key as ConfigKey } : {}) }
  const r = await helperCall('POST', '/v1/config', { body: { changes: v.changes } })
  if (!r) return { status: 503, code: 'NO_HELPER' }
  const j = (r.json ?? {}) as { job?: unknown; code?: unknown; key?: unknown }
  if (r.status === 202) return { status: 202, job: safeJob(j.job) }
  if (r.status === 401 || r.status === 403 || r.status === 404) return { status: 503, code: 'NO_HELPER' }
  const code = typeof j.code === 'string' && j.code in CODES ? j.code : 'HELPER_ERROR'
  const key = typeof j.key === 'string' && (CONFIG_KEY_LIST as readonly string[]).includes(j.key) ? (j.key as ConfigKey) : undefined
  return { status: r.status, code, ...(key ? { key } : {}) }
}

const CODES = { INVALID: 1, UNKNOWN_KEY: 1, INVALID_VALUE: 1, SAME_PORT: 1, SAME_HOST: 1, KEEP_UPDATER: 1, BUSY: 1, NOT_AVAILABLE: 1 }

export { CONFIG_DEFAULTS }
