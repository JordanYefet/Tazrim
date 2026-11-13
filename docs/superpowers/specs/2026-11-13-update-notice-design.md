# Updates from inside Tazrim (ENG-98)

Status: design, 2026-11-13. Linear: ENG-98.

## Why

Tazrim ships as a Docker image (`ghcr.io/jordanyefet/tazrim`) through the Release
workflow, with a GitHub release and a `vX.Y.Z` tag per version. Someone running it
at home has no way of knowing a new version is out, and updating means leaving the
app and running Docker commands by hand.

The owner wants updating to be **as simple as possible, for everyone, not only the
power user**: Tazrim says a new version exists, you press one button, you watch it
happen, and you are back in the app on the new version. Docker commands exist only
as a fallback, out of sight until asked for.

## Goals

- Tazrim finds out by itself, at most once a day, when a newer release exists, and says so
  quietly in Settings → About.
- A "Check for updates" button in About gives an answer on demand.
- One button updates: backup, download, restart, database migration, health check, with
  a full-screen progress page showing each step.
- If the update fails, the app is left working on the version it was on, with its data.
- After a successful update, the person can go back to the previous version once.

## Non-goals

- Updating Caddy, AdGuard or anything other than the Tazrim container.
- Pre-releases, update channels, or choosing an arbitrary version to install.
- A backups UI (listing, downloading, restoring backups by hand). Backups stay invisible
  except as the thing rollback restores.
- Updating installs that don't run through the compose file (e.g. `npm run dev`, Vercel).
  They may show the notice; they never show the update button.

## Anti-goals (would be a failure even if it works)

- The updater becomes a general remote-control for Docker. It does exactly one job.
- The check slows down or breaks any page when GitHub or the network is unreachable.
- Docker commands, image names or log output shown to someone who didn't ask for them.
- The public demo shows the notice, the check or the update button.
- Layout jumping between states (see "Stable layout" below).

## Decided by the owner

1. **A host-side helper container does the update** (2026-11-13, in the ticket). A
   container can't pull its own image or restart itself.
   - The helper mounts the Docker socket. This is a security trade-off the self-hoster
     accepts; the README must say so plainly.
   - It accepts one request: update the Tazrim container to a given release version (and
     its mirror, roll back to the previous one). No shell, no other images or containers.
   - It is optional. Without it the update button is hidden and the notice offers the
     manual command instead.
2. **Progress layout A: a full-screen page** (mockup, 2026-11-13). The update takes over
   the whole app (no nav), shows a progress bar and a fixed list of steps whose icons
   change in place: backup → download → restart → database update → final check. It
   reloads itself into the new version when done.
3. **Failure shows in place.** The failed step turns red in its row; a sentence says
   whether anything changed ("Tazrim keeps running on v1.0.0, no data changed"); buttons
   "Try again" and "Back to the app".
4. **Manual commands only behind a tap.** Wherever a Docker command could help (no helper
   installed; a failed update), it sits behind a collapsed "Show manual commands" link.
   Default view has none.
5. **Simple for everyone.** Copy in plain Hebrew, no Docker vocabulary outside the
   collapsed section.

## Calls I made (owner can overturn)

- **Rollback: only the most recent update, until the next one.** An update can migrate the
  database; the old version can't read a migrated database. So rollback means the
  previous image *plus* restoring the backup taken just before that update, and anything
  added since is deleted. The confirm dialog says what will be lost (counts of uploads and
  transactions since the backup). The owner had not decided this when the design was written
  ("not sure yet"); it is the simplest safe version and is easy to remove.
- **Automatic rollback when the new version doesn't come up.** If the new container isn't
  healthy within the time limit, the helper restores the backup and starts the old image
  again. No data can be lost here: the new version never served a request that wrote.
- **Backups: the last 5 pre-update backups**, in `/data/backups/` on the data volume
  (`pre-update-v<from>-to-v<to>-<timestamp>.db`), made with SQLite `VACUUM INTO` while the app
  runs (a consistent single file, no stop needed). Older ones are deleted after a
  successful backup. Same volume as the database: this protects against a bad release,
  not against losing the disk. The README says so.
- **Notice placement** (changed by the owner after the build: the card now has its own page,
  Settings → Updates (`/settings/updates`), with its own tile and the dot; About keeps only
  the plain version line). Original text: a card in Settings → About in place of the version line in the
  footer (mockup frame 1), plus a small dot on the About tile in Settings. No dot in the
  profile menu or nav (quiet).
- **Who can update**: anyone signed in (it's a household app, and the update is backed up
  and reversible). With login off, anyone who can open the app. Read-only mode: nothing.
- **Version comparison**: semver of the running `package.json` version against the
  latest GitHub release tag (`vX.Y.Z`, non-draft, non-prerelease). Newer only; never
  offer a downgrade as an "update".

## How it works

### Pieces

| Piece | Where | Job |
|-------|-------|-----|
| Update check | app server (`lib/updates/`) | asks GitHub for the latest release, caches the answer in `Setting` |
| Update API | `app/api/updates/*` | status for the page, "check now", "start update", "roll back", toggles the daily check |
| About card + Settings dot | `app/about`, `app/settings` | notice, buttons, switch |
| Progress page | `app/updating` (full screen, outside the app shell) | steps, bar, failure, reload |
| Helper ("updater") | same image, different command; new service in `docker-compose.yml` | backup handoff, pull, recreate, health-wait, auto-rollback, rollback |

### The check

- Request: `GET https://api.github.com/repos/JordanYefet/Tazrim/releases/latest`, from the
  server, with a short timeout (≈5 s) and a generic User-Agent (`Tazrim/<version>`), no
  auth. Nothing about the household is sent; GitHub sees the IP address.
- Cache in `Setting` (keys under `updates.*`): latest version, its notes (markdown body,
  trimmed), its URL, checked-at, last error. The release notes are shown as plain text
  bullets (no raw HTML rendering).
- **Automatic (owner, 2026-11-13: "a cron job")**: a scheduled job inside the server
  (started from `instrumentation.ts`, Node runtime only, not in read-only/demo) checks once
  a day: shortly after start if the cache is older than 24 h, then every 24 h. Pages only
  read the cache, never wait on GitHub. The switch "בדיקה אוטומטית פעם ביום" is **on by
  default** and turns the job off; the manual button keeps working.
- **Manual**: "בדיקת עדכונים" calls the API, shows a spinner in the button (button keeps its
  width), then "Up to date" / the new version / a clear error ("Couldn't reach GitHub. Try
  again later."). Never leaves the page stuck: the request has its own timeout.
- Read-only (`TAZRIM_READ_ONLY=1`) and demo: no check, no card, no dot, no API (403).

### The helper (updater)

- **Same image, different command.** The compose file gets an optional `updater` service
  (profile `updater`, like `https`/`dns`), image `ghcr.io/jordanyefet/tazrim:<same tag>`,
  command `node /app/updater/server.mjs`, running as root, with
  `/var/run/docker.sock` and the `tazrim-data` volume mounted. No published port: it
  listens only on the compose network. No extra image to publish, nothing new to download.
- **Talks to Docker through the socket's HTTP API** (Node's `http` with `socketPath`), no
  docker CLI in the image.
- **Auth between app and helper**: on start the helper writes a random token to
  `/data/.updater-token` (mode 0600, owned by the app's user); the app sends it as a
  bearer token. Requests without it get 401. The app knows the helper exists by being
  able to reach `http://updater:8080/health` with that token (short timeout, cached a minute).
- **Which container**: the helper finds the Tazrim container by its compose labels
  (`com.docker.compose.project` = its own project, `com.docker.compose.service=tazrim`).
  It refuses to touch anything else.
- **Accepted requests** (all JSON, token required):
  - `POST /update {version: "1.2.0"}`: version must match `^\d+\.\d+\.\d+$` and be
    newer than the running one. Image is always `ghcr.io/jordanyefet/tazrim:<version>`;
    nothing in the request can change the image name.
  - `POST /rollback`: only if the last job was a successful update and its backup still exists.
  - `GET /status`: the current or last job (see below).
- **Update job** (one at a time; a second request while running → 409). The steps on
  screen are backup → download → restart → database update → final check, but the
  **download runs first** and the backup is taken right before the stop, so nothing saved
  during a long download is lost on rollback:
  1. *Download* — `POST /images/create?fromImage=ghcr.io/jordanyefet/tazrim&tag=<version>`;
     stream progress (bytes) into the job status. (Shown as step 2; step 1 "backup" shows
     as waiting until then. The page may order the rows as it likes as long as they don't
     move; the mockup order is backup first.)
  2. *Backup* — the helper calls back to the app (`POST http://tazrim:3000/api/updates/backup`,
     same token): the app sets an "updating" flag that **blocks writes** (as read-only mode
     does, with a "Tazrim is updating" message) and refuses to start bank syncs, then takes
     the `VACUUM INTO` backup and returns its filename. The helper checks it exists and is
     non-empty. Keep 5. The helper never opens the database for reading or writing except
     to restore a backup file.
  3. *Restart* — inspect the running container; stop it; rename it `<name>-previous`;
     create a new container with the same config (env, mounts, ports, networks with
     aliases, labels, restart policy, healthcheck) but the new image; start it. Also tag
     the new image as `ghcr.io/jordanyefet/tazrim:latest` locally so a later
     `docker compose up -d` keeps it (if the service was pinned with `TAZRIM_VERSION`,
     the README notes that compose will go back to the pin).
  4. *Database update* — the new container's entrypoint runs migrations as today; the
     helper just waits.
  5. *Final check* — wait for Docker health `healthy` (timeout 3 min). Then remove the
     `-previous` container (keep its image for rollback).
  - Failure in 1 or 2: nothing changed; the app clears its "updating" flag; job `failed`
    at that step.
  - Failure in 3–5: stop and remove the new container, restore the backup over
    `/data/tazrim.db` (delete `-wal`/`-shm` first), rename `-previous` back, start it; job
    `failed` with `restored: true`.
- **Rollback job**: same mechanics as the failure path in 3–5, from the current container to
  the previous version's image with the backup restored. Steps shown: backup restore,
  restart, final check.
- **A bank sync is running** when Update is pressed: the confirm dialog says so and the
  update waits until it ends (button disabled with "a sync is running"). Never kill it.
- **Which installs are updatable**: only when the running container's image is a
  `ghcr.io/jordanyefet/tazrim` image (by repo name, any tag). A locally built image →
  no update button, manual commands only. The helper reports this in `/health`.
- **Keeping compose happy**: the recreated container copies all labels (including compose's),
  and the new image is tagged `:latest` locally, so a later `docker compose up -d` leaves
  it alone or recreates it with the same image. If the owner pinned `TAZRIM_VERSION`,
  compose returns to the pin on its next `up`; the README says so. No detection needed.
- **The helper's own version**: the helper isn't recreated by an update (it can't replace
  itself mid-job); `docker compose up -d` refreshes it. So the app↔helper API is
  versioned (`/v1/...`) and only ever grows; `/health` reports the helper's version and API
  version, and the app hides the update button (manual commands instead) if the helper
  speaks an API it doesn't know.
- **Rollback signs everyone out** (the sessions table is in the restored backup); the rollback
  dialog says so.
- **Status** lives in the helper's memory **and** in `/data/.update-status.json` (so the app,
  coming back up as the new version, can read the outcome even if the helper restarted). It
  holds: job kind, from/to versions, step list with state (`waiting|running|done|failed`),
  download bytes, error text (short, human), finished-at.

### The progress page (layout A)

- Route outside the app shell (no sidebar/nav), centered column, same look as the mockup:
  title "מעדכנים לגרסה vX.Y.Z", one line "אפשר להשאיר את הדף פתוח. הוא יתרענן לבד בסיום.",
  progress bar, five steps. The bar is driven by step + download bytes.
- Polls `GET /api/updates/status` every second. While the app is down (fetch fails) the
  page shows the "restart" step as running and keeps polling; it must already have
  everything it needs loaded (no navigation, no new chunks) to survive the restart.
- When the status says done and the app answers with the new version: brief "done" state,
  then a full reload to About.
- Failure: the step row turns red in place with its short reason; sentence about whether
  anything changed; buttons "לנסות שוב" (primary) and "חזרה לאפליקציה"; a collapsed
  "הצגת פקודות ידניות" with the manual update and restore commands.
- Rollback uses the same page with its own three steps and title "חוזרים לגרסה vX.Y.Z".
- Reduced motion: no spinner rotation (static icon), bar without animation.
- **Buttons (owner asked, 2026-11-13): sized like the sign-in card.** Failure actions are two
  equal halves (`grid-cols-2`), 48 px tall (`h-12`), `rounded-xl`, 16 px text, primary bold
  with `text-primary-foreground` (dark text on the dark theme's lighter blue; white text
  there fails contrast), secondary bordered on the card colour, `active:scale-[0.97]`. Reuse
  `components/auth/ui.ts`'s button classes if they fit. "הצגת פקודות ידניות" is a real
  button with a 44 px tall hit area (`min-h-11`), full width, centred. The action row's 48 px
  is reserved in every state, so nothing moves when it appears.

### About card states

Mockup frames 1, 1b and 4a. All states keep the same card and the same button row, so
nothing moves (owner's "stable layout" rule): the version line, the notes area, the button
row, the "last checked" line, then the switch.

- Up to date: "גרסה v1.2.0 · זו הגרסה האחרונה", button "בדיקת עדכונים".
- New version + helper: badge "גרסה חדשה", notes (first ~5 bullets) + link to the GitHub
  release, primary "עדכון לגרסה vX.Y.Z", then "בדיקת עדכונים".
- New version, no helper: same, but instead of the update button a plain sentence plus the
  collapsed "הצגת פקודות ידניות" (`docker compose pull && docker compose up -d`, with copy)
  and a short line on adding the helper.
- After an update: "עודכן ל-vX.Y.Z היום ב-HH:MM", and under a divider "משהו לא עובד כמו
  שצריך בגרסה החדשה?" + "חזרה לגרסה vA.B.C" (opens the rollback confirm; gone after the
  next update or if the backup is gone).
- Check failed: the last-checked line says so in muted text; no red banners.
- Switch: "בדיקה אוטומטית פעם ביום".

Update confirm dialog (frame 2): notes, the line about the backup and the restart, "עדכון
עכשיו" / "ביטול". Rollback confirm (frame 5): what it does, the backup time, what will be
deleted (counts), destructive-styled "חזרה לגרסה הקודמת" / "ביטול".

Existing app dialog component and tokens are reused; no new visual language. Hebrew
copy in the mockup is the starting point. The mockup is
[`2026-11-13-update-notice-mockup.html`](2026-11-13-update-notice-mockup.html) next to this
file (a fragment; open it in a browser). Frames: 1 About with a new version, 1b no helper,
2 update confirm, 3A progress (chosen; 3B rejected), 4a after success, 4b failure,
5 rollback confirm. In 1b the command must sit behind "הצגת פקודות ידניות", not open as drawn.

### Privacy copy

The About page's privacy section says nothing is sent out and the browser never contacts
external servers. The update check contacts GitHub from the server. The copy must be
adjusted to say so honestly (and that it can be turned off). Wording: see "Privacy copy" below.

### Docs

README: a section on updates — the button, the optional helper (`COMPOSE_PROFILES=updater`),
the Docker-socket trade-off in plain words (a container with the socket can control Docker
on this computer; this one only accepts "update Tazrim"), where backups live and that they
share the disk, and the manual commands.

## Testing

- Unit: semver compare; GitHub response parsing (draft/prerelease/garbage); cache freshness;
  read-only blocks; helper request validation (version format, newer-only, token, one job at a time);
  helper container selection by labels; status file round-trip.
- Helper Docker calls behind a small interface so the job sequence (including both failure
  paths and rollback) is tested with a fake.
- End to end on a test install (not the owner's production on :3100): an older image shows the
  notice, update goes through with a backup taken, rollback restores, and a forced bad start
  rolls back by itself. Network off: About still renders instantly.

## Replaces the owner's update.sh

The owner wants to update production through the app and retire `~/tazrim-prod/update.sh`
(pull, stop, back up, start, keep 10). So the in-app flow must cover everything it does:
backup before every update, keep several, migrations on start. Deploying this means adding
the `updater` service to `~/tazrim-prod/docker-compose.yml` (its container is named
`tazrim-prod`, service `tazrim`, project `tazrim-prod`, volume `tazrim-prod-data`); the
helper must not assume the names in the repo's compose file. Retiring `update.sh` is the
owner's call after the first successful in-app update.

## Privacy copy (my wording, owner can change)

Privacy item "שום דבר לא נשלח החוצה" becomes, in substance: none of your data leaves the
computer; once a day Tazrim asks GitHub whether there is a new version (can be turned off in
Settings → About).

## Background behind the progress card

Owner (2026-11-13): an animated background behind the card, designed with the
design-taste-frontend, apple-design and emil-design-eng skills. Mockup:
`2026-11-13-update-notice-page-mockup.html`. Owner's pick: **B, the drift follows the update**:
the sign-in page's drifting gradient (`.auth-gradient`, lavender/pink/blue, 12 s alternate)
while working; cross-fades (opacity, ~900 ms) to a calm teal-green when done; to a soft red
and stops drifting when it fails (owner: "a reddish background if it's failed"). Three stacked
gradient layers, opacity only. Dark-mode variants of all three. Reduced motion: no drift,
colours still change. The card stays solid (like the sign-in card), not glass.

## Left to the builder

Component structure, file names under the paths above, exact polling/backoff, how download
bytes map to the bar, the copy of error reasons, test layout.

## Stable layout

Every state of the About card and the progress page keeps the same rows in the same places;
values change in place, rows dim rather than disappear. Buttons keep their width while
loading.
