# Updates From Inside Tazrim (ENG-98) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tazrim checks GitHub daily for a newer release, says so in Settings → About, and updates itself in one tap through an optional helper container, with a backup, a full-screen progress page, automatic rollback on a failed start, and a one-time manual rollback.

**Architecture:** The app (Next.js) owns the check, the cache, the backups and the UI. A small dependency-free Node helper (`updater/`, shipped in the same image, run as a separate compose service with the Docker socket) owns pull, recreate, health-wait and restore. They talk over the compose network with a token from the shared data volume; the job's status is mirrored to a JSON file on that volume so the page survives the restart.

**Tech Stack:** Next.js 15 (App Router), Prisma + SQLite, Vitest, Tailwind, lucide-react (the project's icon set), Node built-ins only in `updater/` (`http` with `socketPath` for the Docker Engine API).

**Spec:** `docs/superpowers/specs/2026-11-13-update-notice-design.md` (read it first). Mockups: `docs/superpowers/specs/2026-11-13-update-notice-mockup.html` (About card states, dialogs) and `docs/superpowers/specs/2026-11-13-update-notice-page-mockup.html` (the progress page, final: background option B, red on failure, 48 px buttons).

## Global Constraints

- Image name is fixed: `ghcr.io/jordanyefet/tazrim`. Nothing in any request can change it.
- Version strings: `^\d+\.\d+\.\d+$` (tags are `v` + that). Only strictly newer versions are offered as updates.
- GitHub: `GET https://api.github.com/repos/JordanYefet/Tazrim/releases/latest`, timeout 5 s, header `User-Agent: Tazrim/<running version>`, `Accept: application/vnd.github+json`, no auth. Skip drafts and prereleases.
- Running version = `package.json` `version` (`import pkg from '@/package.json'`).
- Settings keys (table `Setting`): `updates.auto` (`'1'`/`'0'`, absent = on), `updates.cache` (JSON), `updates.last` (JSON: last finished job, for "updated on…" and rollback).
- Read-only (`isReadOnly()`): no scheduled check, no card, no dot, every `/api/updates/*` answers 403.
- Backups: `<dataDir>/backups/pre-update-v<from>-to-v<to>-<YYYYMMDD-HHmmss>.db`, via `VACUUM INTO`; keep newest 5 matching `pre-update-*.db`.
- Helper API is versioned: every path under `/v1/`. Port 8080, compose network only (no published port). Token file `<dataDir>/.updater-token` (0600, chowned 1000:1000), sent as `Authorization: Bearer <token>`.
- Status file: `<dataDir>/.update-status.json`. Updating flag file: `<dataDir>/.updating`.
- Health wait 3 min; then automatic restore.
- Copy is Hebrew, plain, no Docker words outside the collapsed "הצגת פקודות ידניות". Zero em-dashes in copy. Strings in the mockups are the starting point.
- Stable layout: rows never move between states; reserve space, cross-fade, dim.
- Buttons on the progress page: two equal halves, `h-12`, `rounded-xl`, 16 px; primary uses `text-primary-foreground`; "הצגת פקודות ידניות" is a button with `min-h-11`.
- Motion: CSS only, opacity/transform; reduced motion = no drift, no spinner rotation, no bar transition. No `linear()` easing (Safari).
- Fake data only in tests and docs (no real household values).
- Commits: GitHub noreply author (check `git log -1 --format=%ae` is `…@users.noreply.github.com`), messages end with the session's Co-Authored-By/Claude-Session lines.

## Review Focus

1. GitHub unreachable or slow (no network, DNS failure, 403 rate limit): pages render instantly from cache; manual check returns a clear error within ~5 s. (Test in Task 2.)
2. The app restarts mid-update while the page polls: fetch failures must read as "restarting", not as an error, and the page must not need new JS chunks. (Test in Task 6.)
3. A second update/rollback request while a job runs, or a rollback when the backup file was deleted: 409 / hidden, never a half job. (Test in Task 4.)
4. A sync running when Update is pressed: the update waits; the backup endpoint refuses while a sync is active. (Test in Task 3.)
5. Locally built image or a helper speaking an unknown API version: no update button, manual commands only. (Test in Task 5.)

---

### Task 1: Version and release parsing

**Files:**
- Create: `lib/updates/version.ts`
- Test: `lib/updates/__tests__/version.test.ts`

**Interfaces:**
- Produces:
  - `parseVersion(s: string): [number, number, number] | null` (accepts `1.2.3` or `v1.2.3`)
  - `isNewer(candidate: string, current: string): boolean` (false if either is unparsable)
  - `interface ReleaseInfo { version: string; url: string; notes: string[]; publishedAt: string }`
  - `parseRelease(json: unknown): ReleaseInfo | null` (null for draft, prerelease, missing/invalid `tag_name`; `notes` = up to 5 bullet lines from `body`, `- `/`* ` stripped, plain text, each ≤ 140 chars, PR links/`by @x in …` suffixes removed)

- [ ] **Step 1: Write failing tests**: `isNewer('1.18.0','1.9.9') === true`, `isNewer('1.2.0','1.2.0') === false`, `isNewer('1.2.0','1.10.0') === false`, `isNewer('x','1.0.0') === false`; `parseRelease({tag_name:'v1.18.0', draft:false, prerelease:false, html_url:'https://github.com/JordanYefet/Tazrim/releases/tag/v1.18.0', published_at:'2026-11-13T11:20:28Z', body:'## What\'s Changed\n* feat: Fake thing by @someone in https://github.com/x/y/pull/1\n* fix: Other fake thing'})` → `{version:'1.18.0', notes:['Fake thing','Other fake thing'], …}` (conventional prefix stripped too); draft → null; prerelease → null; `tag_name:'latest'` → null.
- [ ] **Step 2: Run** `npx vitest run lib/updates/__tests__/version.test.ts`, expect FAIL (module missing).
- [ ] **Step 3: Implement** in `lib/updates/version.ts`.
- [ ] **Step 4: Run** the same command, expect PASS.
- [ ] **Step 5: Commit** `feat: parse release versions for the update check (ENG-98)`.

### Task 2: Check, cache and daily schedule

**Files:**
- Create: `lib/updates/check.ts`, `lib/updates/settings.ts`
- Modify: `instrumentation.ts` (start the schedule after backfills, same guards)
- Test: `lib/updates/__tests__/check.test.ts` (use `lib/db/__tests__/test-db.ts`'s `createTestDb`/`usePrismaOn` pattern; mock `fetch` with `vi.stubGlobal`)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `interface UpdateCache { latest: ReleaseInfo | null; checkedAt: string | null; error: 'NETWORK' | 'RATE_LIMIT' | 'BAD_RESPONSE' | null }`
  - `getAutoCheck(): Promise<boolean>`, `setAutoCheck(on: boolean): Promise<void>` (in `settings.ts`)
  - `getUpdateCache(): Promise<UpdateCache>`
  - `checkNow(fetchImpl = fetch): Promise<UpdateCache>` (never throws; on failure keeps the previous `latest`, sets `error`, updates `checkedAt`)
  - `startDailyCheck(): void` (idempotent per process via a `globalThis` symbol; first run after 30 s if cache older than 24 h, then every 24 h; each tick re-reads `getAutoCheck()`; `unref()` the timers)
  - `CURRENT_VERSION: string` (from package.json)

- [ ] **Step 1: Write failing tests**: success stores and returns latest; fetch rejecting → `error:'NETWORK'`, previous `latest` kept; status 403 → `'RATE_LIMIT'`; garbage JSON → `'BAD_RESPONSE'`; a fetch that never resolves returns `'NETWORK'` within the 5 s timeout (use fake timers); `getAutoCheck()` is true when unset, false after `setAutoCheck(false)`.
- [ ] **Step 2: Run** `npx vitest run lib/updates/__tests__/check.test.ts`, expect FAIL.
- [ ] **Step 3: Implement** with `AbortSignal.timeout(5000)`.
- [ ] **Step 4: Wire** `instrumentation.ts`: after the backfills block, `const { startDailyCheck } = await import('./lib/updates/check'); startDailyCheck()` inside its own try/catch (log, never fatal). Read-only already returns earlier.
- [ ] **Step 5: Run** tests, expect PASS; `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `feat: check GitHub for a newer release once a day (ENG-98)`.

### Task 3: Data paths, backup, updating flag, sync guard

**Files:**
- Create: `lib/updates/paths.ts`, `lib/updates/backup.ts`
- Modify: `lib/sync/runs.ts` (export `isSyncActive(): boolean`, true if `currentRun()` or any queue item is active, reusing `active`), `middleware.ts` + `lib/read-only.ts` (writes blocked while the updating flag exists), the sync start routes under `app/api/sync/` (refuse with 409 `{code:'UPDATING'}` while flagged)
- Test: `lib/updates/__tests__/backup.test.ts`, extend `lib/__tests__/read-only.test.ts`

**Interfaces:**
- Produces:
  - `dataDir(): string` (dirname of the file in `TAZRIM_DATABASE_URL`, else `prisma/` like the dev default)
  - `takeBackup(from: string, to: string, now = new Date()): Promise<string>` (absolute path; `VACUUM INTO`; prunes to 5)
  - `pruneBackups(keep = 5): Promise<string[]>` (returns deleted)
  - `setUpdating(on: boolean): void`, `isUpdating(): boolean` (flag file, sync fs)
  - `UPDATING_MESSAGE = 'תזרים מתעדכן עכשיו. שינויים יישמרו אחרי העדכון.'`
  - `isWriteBlockedWhileUpdating(method, pathname): boolean` = `isWriteBlocked(method, pathname)` but `/api/updates/*` stays allowed

- [ ] **Step 1: Failing tests**: backup file exists, is a valid SQLite with the same row count as a fake table; 7 backups → newest 5 kept; name matches `pre-update-v1.0.0-to-v1.2.0-20261113-091400.db` for a fixed `now`; `isWriteBlockedWhileUpdating('POST','/api/updates/start') === false`, `('POST','/api/upload') === true`, `('GET','/api/summary') === false`.
- [ ] **Step 2: Run** `npx vitest run lib/updates lib/__tests__/read-only.test.ts`, expect FAIL.
- [ ] **Step 3: Implement**; in `middleware.ts`, after the read-only check: `if (isUpdating() && isWriteBlockedWhileUpdating(req.method, pathname)) return 403 { error: UPDATING_MESSAGE, updating: true }`. The client guard (`components/layout/read-only-guard.tsx`) shows that message for `updating: true` responses the same way it shows read-only ones.
- [ ] **Step 4: Run** tests, expect PASS.
- [ ] **Step 5: Commit** `feat: pre-update backups and a write pause during updates (ENG-98)`.

### Task 4: The helper (`updater/`)

**Files:**
- Create: `updater/server.mjs` (HTTP + token), `updater/job.mjs` (job sequence, pure, takes a `docker` and `app` port), `updater/docker.mjs` (Docker Engine API over the socket), `updater/status.mjs` (memory + status file)
- Test: `updater/__tests__/job.test.mjs`, `updater/__tests__/server.test.mjs` (vitest picks up `.mjs`; add `updater/**` to `vitest.config.ts` include only if needed)

**Interfaces:**
- Produces (HTTP, all JSON, all need the bearer token, else 401):
  - `GET /v1/health` → `{ ok: true, helperVersion: string, api: 1, updatable: boolean, image: string, runningVersion: string | null }` (`updatable` = target container's image repo is `ghcr.io/jordanyefet/tazrim`)
  - `POST /v1/update {version}` → 202 `{job}` | 400 bad version / not newer | 409 job running | 422 not updatable
  - `POST /v1/rollback` → 202 | 409 (no successful last update, backup missing, or job running)
  - `GET /v1/status` → `JobStatus`
  - `type JobStatus = { kind: 'update'|'rollback'; from: string; to: string; state: 'running'|'done'|'failed'; restored: boolean; steps: { id: 'backup'|'download'|'restart'|'migrate'|'check'|'restore'; state: 'waiting'|'running'|'done'|'failed' }[]; downloaded?: { current: number; total: number }; error?: string; backup?: string; previousImage?: string; finishedAt?: string }`
- Docker port used by `job.mjs` (faked in tests): `findTarget()`, `pull(image, tag, onProgress)`, `inspect(id)`, `stop(id)`, `rename(id, name)`, `createLike(inspected, image)`, `start(id)`, `waitHealthy(id, ms)`, `remove(id)`, `tag(imageId, repo, tag)`.
- App port: `requestBackup(from, to) → Promise<string>` (`POST http://tazrim:3000/api/updates/backup` with the token; host from env `TAZRIM_APP_URL`, default the target container's compose service name on port 3000), `restoreBackup(file)` (helper-side file ops on the mounted volume: delete `tazrim.db-wal`/`-shm`, copy backup over `tazrim.db`, chown 1000:1000).

Job order (update): download → backup (app sets the flag, refuses if a sync runs → job fails "a sync is running", nothing changed) → stop, rename `<name>-previous`, create + start new, tag `:latest` → migrate (wait) → check (healthy within 3 min) → remove `-previous`, clear flag. Failure before stop: clear flag (call `POST /api/updates/backup` is not repeated; the helper calls `DELETE /api/updates/backup` to clear the flag). Failure after stop: remove new, `restoreBackup`, rename back, start, `restored: true`. Rollback: restore step → restart with `previousImage` → check.

Target selection: container with label `com.docker.compose.service=tazrim` and the same `com.docker.compose.project` as the helper's own container (read its own id from `/proc/self/cgroup` or `HOSTNAME`). Refuse anything else. `createLike` copies Env, Cmd/Entrypoint (as in image config if not overridden), Labels, ExposedPorts, HostConfig (Binds, Mounts, PortBindings, RestartPolicy, NetworkMode), Healthcheck, and reconnects every network with its aliases.

- [ ] **Step 1: Failing job tests** (fake docker + app): happy path → steps all `done`, `stop` before `createLike`, backup requested after pull; pull fails → `failed` at download, `stop` never called; backup refused (sync) → `failed` at backup, `stop` never called; unhealthy → `restored:true`, old container renamed back and started, `restoreBackup` called with the backup path; rollback with no `last` → 409; second `update` while running → 409; status file written after every step change.
- [ ] **Step 2: Failing server tests**: no/wrong token → 401; `{version:'1.2.0; rm -rf /'}` → 400; `{version:'0.0.1'}` when running 1.0.0 → 400.
- [ ] **Step 3: Run** `npx vitest run updater`, expect FAIL.
- [ ] **Step 4: Implement** the four modules. Token: generate with `crypto.randomBytes(32).toString('hex')` on start if the file is missing.
- [ ] **Step 5: Run** tests, expect PASS.
- [ ] **Step 6: Commit** `feat: the updater helper: pull, recreate, health-wait, restore (ENG-98)`.

### Task 5: App ↔ helper client and API routes

**Files:**
- Create: `lib/updates/helper.ts`, `lib/updates/state.ts`, `app/api/updates/route.ts` (GET), `app/api/updates/check/route.ts` (POST), `app/api/updates/auto/route.ts` (PUT `{on}`), `app/api/updates/start/route.ts` (POST `{version}`), `app/api/updates/rollback/route.ts` (POST), `app/api/updates/backup/route.ts` (POST `{from,to}` / DELETE; token auth, not session)
- Modify: `lib/auth/config.ts` (`/api/updates/backup` public: the route checks the token itself)
- Test: `lib/updates/__tests__/state.test.ts`, `app/api/updates/__tests__/backup.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3; helper HTTP from Task 4.
- Produces:
  - `helperHealth(): Promise<HelperHealth | null>` (1 s timeout, cached 60 s; null when unreachable, wrong token, or `api !== 1`)
  - `helperStatus(): Promise<JobStatus | null>` (falls back to reading the status file when the helper is unreachable)
  - `type UpdateView = { current: string; latest: ReleaseInfo | null; newer: boolean; checkedAt: string | null; error: UpdateCache['error']; auto: boolean; canUpdate: boolean; syncRunning: boolean; job: JobStatus | null; lastUpdate: { from: string; to: string; at: string; canRollBack: boolean; backupAt: string; since: { uploads: number; transactions: number } } | null }`
  - `getUpdateView(): Promise<UpdateView>` (`canUpdate` = helper health ok and `updatable`; `since` counts `UploadHistory` and bank + card transactions created after the backup time)
  - GET `/api/updates` → `UpdateView`; POST `/check` → `UpdateView` after `checkNow()`; POST `/start` → 202 or the helper's error code; POST `/rollback` → 202/409.
  - When a job finishes `done`, `getUpdateView()` records `updates.last` once (idempotent by `finishedAt`).

- [ ] **Step 1: Failing tests**: helper unreachable → `canUpdate:false`, `job` from the status file; helper `api: 2` → `canUpdate:false`; helper `updatable:false` → `canUpdate:false`; backup route without token → 401, with token and a sync active → 409 `{code:'SYNC_RUNNING'}`, with token → 200 `{file}` and the updating flag set; DELETE clears it; every route answers 403 in read-only.
- [ ] **Step 2: Run** `npx vitest run lib/updates app/api/updates`, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, expect PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat: update API: status, check, start, roll back (ENG-98)`.

### Task 6: The progress page `/updating`

**Files:**
- Create: `app/updating/page.tsx` (server: reads `getUpdateView()`, redirects to `/about` if no job and no `?start`), `components/updates/updating-screen.tsx` (client), styles in `app/globals.css` next to `.auth-gradient` (`.update-drift` + three layers)
- Modify: `lib/auth/config.ts` `isBarePath` adds `/updating` (bare, but still needs a session: do NOT add it to the public list)
- Test: `components/updates/__tests__/updating-screen.test.tsx`

**Interfaces:**
- Consumes: `UpdateView`, `JobStatus`.
- Produces: `<UpdatingScreen initial={UpdateView} />`; pure helper `progressOf(job: JobStatus): number` (0..1: backup .1, download .1→.5 by bytes, restart .65, migrate .8, check .92, done 1) exported for tests.

Behaviour (spec "The progress page" + page mockup): polls `GET /api/updates` every 1 s with `cache:'no-store'`; a failed fetch shows the restart step as running and keeps polling (no error); when `job.state==='done'` and `current === job.to`, show done for 1.2 s then `location.assign('/about')`. A 404 from `/api/updates` after the restart step means the app now runs a version without this feature (an older release, or a rollback to one): treat it as done and `location.assign('/')`. Background: three stacked gradient layers (working / done teal-green / failed red), cross-fade opacity 900 ms, drift 12 s alternate as `.auth-gradient`, paused on failure; dark variants; reduced motion stops drift. Card solid (`surface-raised` like the sign-in card), rows fixed, icons cross-fade, bar `scaleX` with `transform-origin: right`. Failure: red row + reason, sentence on what changed (`restored` true → "תזרים חזר לגרסה vX ולנתונים מלפני העדכון", false → "תזרים ממשיך לרוץ על vX, ושום נתון לא השתנה"), buttons "לנסות שוב" (POST start again) and "חזרה לאפליקציה", collapsed "הצגת פקודות ידניות" with `docker compose pull && docker compose up -d` and a copy button. Rollback job: title "חוזרים לגרסה vX", steps restore/restart/check.

- [ ] **Step 1: Failing tests**: `progressOf` values above; rendering a failed job shows the reason in the failed row and both buttons; a fetch rejection keeps state "running" with the restart row running; the manual commands are not visible until the toggle is pressed.
- [ ] **Step 2: Run** `npx vitest run components/updates`, expect FAIL.
- [ ] **Step 3: Implement.** All strings and the polling logic live in the one client component so nothing new loads during the restart.
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat: full-screen update progress with a background that follows it (ENG-98)`.

### Task 7: About card, Settings dot, dialogs, privacy copy

**Files:**
- Create: `components/updates/version-card.tsx` (client), `components/updates/update-dialogs.tsx` (reuse `components/ui/app-dialog.tsx` / `confirm-dialog.tsx`)
- Modify: `app/about/page.tsx` (card replaces the footer's version line; privacy item text), `app/settings/page.tsx` + `components/settings/settings-tiles.tsx` (optional `dot?: boolean` on a tile, a small primary dot beside the About title; reserve no extra space)
- Test: `components/updates/__tests__/version-card.test.tsx`

**Interfaces:**
- Consumes: `UpdateView`, routes from Task 5.
- Produces: `<VersionCard initial={UpdateView} />`.

States exactly as spec "About card states" (mockup frames 1, 1b, 4a): same rows in every state; "בדיקת עדכונים" keeps its width while checking (spinner inside); no helper → sentence + collapsed manual commands + one line on adding the helper (link to the README section); after an update → "עודכן ל-vX היום ב-HH:MM" and, under a divider, "משהו לא עובד כמו שצריך בגרסה החדשה?" + "חזרה לגרסה vA" (only if `canRollBack`). Update confirm (frame 2) → POST start → `router.push('/updating')`; disabled with "סנכרון רץ עכשיו" while `syncRunning`. Rollback confirm (frame 5): backup time, counts from `since`, "כל מי שמחובר יצטרך להתחבר מחדש", destructive "חזרה לגרסה הקודמת". Switch "בדיקה אוטומטית פעם ביום" → PUT auto. Privacy item: title "הנתונים לא יוצאים מהמחשב", body "כל הקבצים מפוענחים ונשמרים מקומית, והגופן מוגש מהאפליקציה עצמה. הדבר היחיד שיוצא: פעם ביום תזרים שואל את GitHub אם יש גרסה חדשה, ואפשר לכבות את זה כאן למטה." Read-only: the card is not rendered, the footer keeps the plain version line.

- [ ] **Step 1: Failing tests**: new version + canUpdate → update button with the version; no helper → no update button, manual commands hidden until toggled; up to date → "זו הגרסה האחרונה"; `canRollBack:false` → no rollback button; check error → muted text, no red.
- [ ] **Step 2: Run** `npx vitest run components/updates`, expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, expect PASS.
- [ ] **Step 5: Commit** `feat: version card in About with update and roll back (ENG-98)`.

### Task 8: Image, compose, README

**Files:**
- Modify: `Dockerfile` (runtime: `COPY --from=build --chown=node:node /app/updater ./updater`), `docker-compose.yml` (service `updater`, `profiles: [updater]`, `image:` same expression as `tazrim`, `entrypoint: ["node", "/app/updater/server.mjs"]`, `user: root`, volumes `/var/run/docker.sock:/var/run/docker.sock` and `tazrim-data:/data`, env `TAZRIM_DATABASE_URL: file:/data/tazrim.db`, `restart: unless-stopped`, no ports, a comment block like the https/dns ones explaining the socket trade-off), `README.md` ("עדכון לגרסה חדשה" section rewritten: the button, turning the helper on with `COMPOSE_PROFILES=updater`, the trade-off in plain words, backups in the volume and that they share the disk, rollback, the manual commands; "גיבוי ושחזור" mentions pre-update backups)

- [ ] **Step 1:** Edit the three files.
- [ ] **Step 2: Verify** `docker compose config --profiles >/dev/null && COMPOSE_PROFILES=updater docker compose config | grep -A12 'updater:'` shows the socket mount and no `ports`.
- [ ] **Step 3: Verify** the image builds in a scratch dir that is not the :3000 dev checkout: `docker build -t tazrim-eng98:test .` succeeds and `docker run --rm --entrypoint node tazrim-eng98:test -e "require('fs').accessSync('/app/updater/server.mjs')"` exits 0.
- [ ] **Step 4: Commit** `feat: optional updater service in docker compose, docs (ENG-98)`.

### Task 9: End-to-end on a throwaway install (controller runs this, not a subagent)

Never touches `~/tazrim-prod` or :3100.

- [ ] **Step 1:** In a scratch dir, a compose project `tazrim-e2e` from the repo's compose file with `image: tazrim-eng98:test` retagged as `ghcr.io/jordanyefet/tazrim:0.1.0-e2e` locally, `TAZRIM_PORT=3201`, `COMPOSE_PROFILES=updater`, `TAZRIM_DEMO=1`, login off (`TAZRIM_AUTH=0` if supported, else set up). Running version is `0.1.0` (package.json on main), so the notice must show v1.18.0 (or newer).
- [ ] **Step 2:** About shows the notice and the update button. Press it; watch `/updating` go through all steps; app comes back on the real latest image; a backup exists in the volume's `backups/`.
- [ ] **Step 3:** Roll back from About: the 0.1.0-e2e image runs again with the backup's data.
- [ ] **Step 4:** Forced failure: make the target's health check fail (e.g. update with an env that breaks start, or temporarily stop the network for the pull) and confirm the automatic restore and the red failure page.
- [ ] **Step 5:** Network off (`docker network disconnect`) → About renders instantly, check gives the clear error.
- [ ] **Step 6:** `docker compose -p tazrim-e2e down -v`, remove the test images.
