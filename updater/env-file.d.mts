/** Types for env-file.mjs, which the app imports for its forms (ENG-121) */
type Key = 'TAZRIM_PORT' | 'TAZRIM_PHONE_PORT' | 'COMPOSE_PROFILES' | 'TAZRIM_LAN_IP' | 'TAZRIM_HOST' | 'TAZRIM_DNS_HOST' | 'TAZRIM_DNS_BIND'

export const CONFIG_DEFAULTS: Readonly<Record<Key, string>>
export const CONFIG_KEYS: readonly Key[]
export const DNS_BINDS: readonly ('127.0.0.1' | '0.0.0.0')[]
export const PROFILES: readonly ('updater' | 'https' | 'dns')[]

export function isPort(v: string): boolean
export function isPrivateIPv4(v: string): boolean
export function isHostName(v: string): boolean
export function parseProfiles(v: string | null | undefined): ('updater' | 'https' | 'dns')[] | null
export function effectiveValues(values: Partial<Record<string, string | null | undefined>> | null | undefined): Record<Key, string>

export type Validation =
  | { ok: true; changes: Partial<Record<Key, string | null>> }
  | { ok: false; code: string; key: Key | null; error: string }
export function validateChanges(changes: unknown, current?: Partial<Record<string, string | null>>): Validation

export function parseEnv(text: string): Record<string, string>
export function configValues(text: string): Record<Key, string | null>
export function applyChanges(text: string, changes: Partial<Record<Key, string | null>>): string
