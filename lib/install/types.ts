/**
 * Container-level settings (ENG-121): what the browser gets. Shared by the server (config.ts)
 * and the client (components/install/container-settings.tsx); no Node imports here.
 */
import { CONFIG_KEYS } from '@/updater/env-file.mjs'

export type ConfigKey = 'TAZRIM_PORT' | 'TAZRIM_PHONE_PORT' | 'COMPOSE_PROFILES' | 'TAZRIM_LAN_IP' | 'TAZRIM_HOST' | 'TAZRIM_DNS_HOST'
export const CONFIG_KEY_LIST = CONFIG_KEYS as readonly ConfigKey[]
export type ConfigValues = Record<ConfigKey, string>
export type ConfigChanges = Partial<Record<ConfigKey, string | null>>
export type Profile = 'updater' | 'https' | 'dns'

/**
 * Can the app change these settings itself?
 * - ready: the helper runs, knows /v1/config and has the install folder
 * - unavailable: the helper runs but can't (no /install mount, not started by compose…); `reason` says which
 * - old: the helper runs but predates ENG-121
 * - none: no helper
 */
export type InstallHelper = 'ready' | 'unavailable' | 'old' | 'none'

export type ConfigStepId = 'write' | 'apply' | 'check' | 'restore'

/** The last settings job, as the browser sees it: no paths, no Docker output */
export interface ConfigJob {
  id: string
  state: 'running' | 'done' | 'failed'
  /** The previous settings are back after a failure */
  restored: boolean
  keys: ConfigKey[]
  steps: { id: ConfigStepId; state: 'waiting' | 'running' | 'done' | 'failed' }[]
  /** Fixed: PORT_BUSY, APPLY_FAILED, NOT_HEALTHY, WRITE_FAILED */
  code?: string
  finishedAt?: string
}

export interface InstallView {
  helper: InstallHelper
  reason: string | null
  /** What compose uses now: the file's values, or the defaults (from the helper's .env, else what the app was started with) */
  values: ConfigValues
  /** The .env values themselves (null = not in the file); only with the helper */
  fileValues: Record<ConfigKey, string | null> | null
  /** The Tazrim folder on the computer, when the helper knows it */
  installDir: string | null
  job: ConfigJob | null
}
