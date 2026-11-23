/**
 * The compose files an update brings (ENG-137), as the browser gets them. No Node imports: shared
 * with the client. The updater decides everything (updater/compose-files.mjs); the app only cleans
 * what it answers, and sends back what the person confirmed.
 */

export const MANAGED_FILES = ['docker-compose.yml', 'docker-compose.egress.yml'] as const

export type FileAction = 'same' | 'replace' | 'create' | 'edited' | 'skip'

export interface PlanFile {
  name: string
  action: FileAction
  /** A unified diff, local file to the release's, for replace, create and edited */
  diff?: string
  truncated?: boolean
  /** Hash of the release's file: what the person confirms */
  sha256?: string
}

export interface UpdatePlan {
  version: string
  /** false: no compose step (not a compose install, or a custom tag); `reason` says which */
  applicable: boolean
  reason?: string
  files: PlanFile[]
  /** Some file is replaced or created: the person confirms first */
  needsApproval: boolean
  /** An approver (passkey or password) exists: the confirmation is an approval */
  approvers: boolean
  /** The update gets a last step for the files (also true for only a pinned version to move): the progress page shows its row from the start */
  step: boolean
}

const ACTIONS: readonly string[] = ['same', 'replace', 'create', 'edited', 'skip']
const HASH_RE = /^[0-9a-f]{64}$/
/** The updater cuts a diff at 400 lines; a longer string than this is not from it */
const MAX_DIFF_CHARS = 200_000

/** The updater's answer as the known fields only; null when it isn't a plan */
export function cleanPlan(json: unknown): UpdatePlan | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  if (typeof j.version !== 'string' || !Array.isArray(j.files)) return null
  const files: PlanFile[] = []
  for (const f of j.files as Record<string, unknown>[]) {
    if (
      !f ||
      typeof f.name !== 'string' ||
      !(MANAGED_FILES as readonly string[]).includes(f.name) ||
      typeof f.action !== 'string' ||
      !ACTIONS.includes(f.action)
    )
      continue
    files.push({
      name: f.name,
      action: f.action as FileAction,
      ...(typeof f.diff === 'string' ? { diff: f.diff.slice(0, MAX_DIFF_CHARS) } : {}),
      ...(f.truncated === true ? { truncated: true } : {}),
      ...(typeof f.sha256 === 'string' && HASH_RE.test(f.sha256) ? { sha256: f.sha256 } : {}),
    })
  }
  return {
    version: j.version,
    applicable: j.applicable === true,
    ...(typeof j.reason === 'string' ? { reason: j.reason.slice(0, 40) } : {}),
    files,
    needsApproval: j.needsApproval === true,
    approvers: j.approvers === true,
    step: j.step === true,
  }
}

/** The files that need the person's yes: replaced or created */
export const changingFiles = (plan: UpdatePlan): PlanFile[] => plan.files.filter(f => f.action === 'replace' || f.action === 'create')

/** Does the dialog have anything to show? Files replaced, created, or edited (their .new) */
export const needsDialog = (plan: UpdatePlan): boolean =>
  plan.applicable && plan.files.some(f => f.action === 'replace' || f.action === 'create' || f.action === 'edited')

/** What the person confirmed, as the updater expects it: { name: sha256 } of the files it will replace or create */
export function confirmedFiles(plan: UpdatePlan): Record<string, string> {
  return Object.fromEntries(changingFiles(plan).flatMap(f => (f.sha256 ? [[f.name, f.sha256]] : [])))
}

/** A passkey answer, or the approval password for a flow the begin call opened */
export type Approval = { response: object } | { flowId: string; password: string }

export interface ComposeConfirm {
  files: Record<string, string>
  approval?: Approval
}

/** The browser's confirm, cut down to known fields; null when it is malformed */
export function parseConfirm(v: unknown): ComposeConfirm | null {
  if (!v || typeof v !== 'object') return null
  const c = v as { files?: unknown; approval?: unknown }
  if (!c.files || typeof c.files !== 'object' || Array.isArray(c.files)) return null
  const files: Record<string, string> = {}
  for (const [k, h] of Object.entries(c.files as Record<string, unknown>)) {
    if (!(MANAGED_FILES as readonly string[]).includes(k) || typeof h !== 'string' || !HASH_RE.test(h)) return null
    files[k] = h
  }
  let approval: Approval | undefined
  if (c.approval !== undefined) {
    const a = c.approval as {
      response?: unknown
      flowId?: unknown
      password?: unknown
    } | null
    if (a && typeof a === 'object' && a.response && typeof a.response === 'object') approval = { response: a.response }
    else if (a && typeof a.flowId === 'string' && typeof a.password === 'string' && a.password && a.password.length <= 500)
      approval = { flowId: a.flowId.slice(0, 200), password: a.password }
    else return null
  }
  return { files, ...(approval ? { approval } : {}) }
}
