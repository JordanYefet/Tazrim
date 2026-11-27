/** Network isolation (ENG-131/133/134): what the browser gets. No Node imports, shared with the client. */

export type EgressHelper = 'ready' | 'unavailable' | 'old' | 'none'

export interface ExtraDomain {
  domain: string
  note: string
  addedAt: string
  approver: string
  /** The provider (israeli-bank-scrapers company id) it was added for; none = all of them */
  provider?: string
}

export interface Approver {
  id: string
  name: string
  rpId: string
  createdAt: string
  kind: 'passkey' | 'password'
}

export type ChangeAction = 'add-domain' | 'remove-domain' | 'turn-on' | 'turn-off' | 'add-approver' | 'remove-approver' | 'update-compose'

export interface EgressChange {
  at: string
  action: ChangeAction
  detail: string
  approver: string
}

/** A line the proxy refused (TCP_DENIED/403) */
export interface Denied {
  /** ms since epoch */
  at: number
  who: 'app' | 'updater' | 'other'
  host: string
  /** The Squid port the client used (ENG-142); old log lines have none */
  port?: number
  /** The provider whose port it was, when it was one's own */
  provider?: string
}

export interface EgressJob {
  id: string
  state: 'running' | 'done' | 'failed'
  restored: boolean
  steps: { id: string; state: 'waiting' | 'running' | 'done' | 'failed' }[]
  /** Fixed code of a failure */
  code?: string
  finishedAt?: string
  restartingHelper?: boolean
}

export interface EgressView {
  helper: EgressHelper
  reason: string | null
  /** The app container is isolated (TAZRIM_EGRESS=1), or the updater says the compose files include it */
  on: boolean
  /** docker-compose.egress.yml in the install folder differs from the one the image carries */
  overrideDiffers: boolean
  extraDomains: ExtraDomain[]
  /** The household's providers (company ids of its accounts that are not archived): the ones with a list that is not empty */
  household: string[]
  approvers: Approver[]
  changes: EgressChange[]
  /** Last refusals, newest first; null while isolation is off */
  blocked: Denied[] | null
  job: EgressJob | null
}

/** What a change asks the updater to do; the updater checks it again */
export type ChangeRequest =
  | { action: 'add-domain'; domain: string; note?: string; provider?: string }
  | { action: 'remove-domain'; domain: string; provider?: string }
  | { action: 'turn-off' }
  | { action: 'remove-approver'; id: string }
  /** The signed-in person's own sign-in passkey or password becomes an approver (ENG-141); an existing approver signs this first */
  | { action: 'add-approver'; kind: 'passkey' | 'password' }
  /** An update that replaces compose files in the install folder (ENG-137): the version and the hashes of the files */
  | { action: 'update-compose'; version: string; files: Record<string, string> }
