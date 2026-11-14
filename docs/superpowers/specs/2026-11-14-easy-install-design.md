# Easy install (ENG-118): shared design

The contract every sub-issue builds against. Linear: ENG-118 (epic), ENG-119…126.
Branch `claude/eng-118-easy-install`; sub-issues are built on branches off it and merged back.

## 1. "Is this the computer itself?" (ENG-119)

**Finding (2026-11-14, Docker Desktop 29.3 on macOS):** the container sees every request to a
published port as coming from the VM gateway (`192.168.65.1`), whether it came from
`localhost`, from the Mac's own LAN address or (by construction) from a phone. Headers
(`Host`, `X-Forwarded-For`) are set by the client and can be faked. Docker also refuses to
publish one host port on both `127.0.0.1` and `0.0.0.0` ("port is already allocated").

**Signal:** which container port a connection came in on.

* The app listens on two ports inside the container:
  * `3000`: Next.js, as today (phones, Caddy, the updater helper).
  * `3001`: the **local door**: a tiny HTTP proxy started from `instrumentation.ts`
    (`lib/local-door.ts`) when `TAZRIM_LOCAL_PORT` is set. It forwards every request to
    `127.0.0.1:$PORT` and **overwrites** the header `x-tazrim-local` with a random secret
    made at process start (32 bytes, hex, kept in `process.env.TAZRIM_LOCAL_SECRET` of that
    process only; never logged, never sent to the browser, never echoed).
* `docker-compose.yml` publishes the door on the host's loopback only, and phones on another
  host port:
  * `127.0.0.1:${TAZRIM_PORT:-3000}:3001` → the computer opens `http://localhost:3000`
  * `${TAZRIM_PHONE_PORT:-3001}:3000` → phones open `http://<computer's address>:3001`
* `isThisComputer(headers)` in `lib/local-request.ts`: true only when the door is on and
  `x-tazrim-local` matches the secret (timing-safe). **Only this** decides that setup skips
  the code. No fallback to Host/X-Forwarded-* for that decision.
* The older `isLocalRequest` (delete-all, sync access) becomes `isThisComputer(h) || <old
  header logic>`, so nothing that works today stops working (the owner's production compose
  publishes `127.0.0.1:3100:3000`, without the door).
* Dockerfile: `ENV TAZRIM_LOCAL_PORT=3001 TAZRIM_LOCAL_HOST=0.0.0.0`. Outside Docker the
  door is off unless `TAZRIM_LOCAL_PORT` is set, and then binds `TAZRIM_LOCAL_HOST`
  (default `127.0.0.1`), which gives the same guarantee on a bare machine.
* Caddy keeps proxying to `tazrim:3000`. Never point anything at 3001 but the loopback publish.
* Risk documented in the README: whoever publishes 3001 on a non-loopback address lets the
  whole network count as "this computer" for first-run setup.

## 2. Settings: where each value lives

| Value | Source of truth | Who changes it in the UI | Page |
|---|---|---|---|
| Time zone | DB `app.timeZone`; `.env` `TAZRIM_TZ` wins | app (ENG-120) | `/settings/general` |
| Sync concurrency | DB `app.syncConcurrency`; `TAZRIM_SYNC_CONCURRENCY` wins | app | `/settings/general` |
| Allowed sign-in addresses | DB `app.origins`; `TAZRIM_ORIGINS` wins | app | `/settings/general` → "מתקדם" |
| Passwords only over HTTPS | DB `app.requireHttps`; `TAZRIM_REQUIRE_HTTPS` wins | app | `/settings/general` → "מתקדם" |
| Vault idle minutes | DB `app.vaultIdleMinutes`; `TAZRIM_VAULT_IDLE_MINUTES` wins | app | `/settings/vault` |
| Port (computer), phone port | `.env` `TAZRIM_PORT`, `TAZRIM_PHONE_PORT` | helper (ENG-121) | `/settings/install` |
| Computer's address | `.env` `TAZRIM_LAN_IP` | helper | `/settings/phones` (ENG-122) |
| HTTPS + local names | `.env` `COMPOSE_PROFILES` (`https`, `dns`) | helper | `/settings/https` (ENG-123) |
| Host names | `.env` `TAZRIM_HOST`, `TAZRIM_DNS_HOST` | helper | `/settings/https` |

* Compose passes app-level variables **empty when unset** (`${X:-}`), so "set in `.env`"
  is detectable: non-empty env = locked.
* Compose also passes the container-level values into the app (`TAZRIM_PORT`,
  `TAZRIM_PHONE_PORT`, `TAZRIM_LAN_IP`, `TAZRIM_HOST`, `TAZRIM_DNS_HOST`, and
  `COMPOSE_PROFILES` as `TAZRIM_PROFILES`) **for display only**; the helper's `.env` is the
  truth when the helper is on.

## 3. Helper: container-level settings (ENG-121)

* Compose mounts the install folder into the helper: `./:/install`.
* Allowed keys only: `TAZRIM_PORT`, `TAZRIM_PHONE_PORT`, `COMPOSE_PROFILES` (subset of
  `updater,https,dns`; `updater` can't be removed from the UI), `TAZRIM_LAN_IP` (IPv4 in a
  private range, or empty), `TAZRIM_HOST`, `TAZRIM_DNS_HOST` (DNS host names).
* Routes (token auth as today): `GET /v1/config` → `{ available, reason?, values, installDir }`;
  `POST /v1/config` `{ changes: { KEY: string | null } }` → 202 `{ job }`, progress through the
  existing `/v1/status` job store (kind `config`).
* Applying: back up `.env` to `.env.bak-<timestamp>`, write it keeping every other line and
  comment, then run `docker compose up -d` in a short-lived `docker:<pinned>-cli` container
  (Engine API) with the host install path (label `com.docker.compose.project.working_dir`)
  mounted at the same path and the socket mounted. Services of a profile turned off are
  stopped and removed. On failure (for example a busy port), put the backup back and apply
  again, then report the error.
* The `updater` service must not reference any of these keys, so a config change never
  recreates the helper mid-job.
* Without the helper (or without the `/install` mount, as in the owner's production): every
  control shows the `.env` line and the command, behind "הצגת שלבים ידניים".

## 4. Pages and copy

* All copy is Hebrew, short plain sentences, matching the existing Settings pages.
* New Settings tiles: "כללי" (`/settings/general`), "התקנה" (`/settings/install`),
  "טלפונים וטאבלטים" (`/settings/phones`), "HTTPS ומפתחות בטלפון" (`/settings/https`).
* Each optional page is a component that `/setup` (ENG-125) renders as a step too.
* Read-only demo: these controls are hidden.

## 5. Testing on the owner's Mac

* `:3100` (production, `~/tazrim-prod`) is never touched. It also holds ports 80, 443 and 53.
* `:3000` is the dev server on demo data; `:3001` is the owner's preview name. Agents use
  `:3011`+ for dev previews.
* The full install test runs from `~/tazrim-test` with `COMPOSE_PROJECT_NAME=tazrim-test`,
  `TAZRIM_PORT=3200`, `TAZRIM_PHONE_PORT=3201`, HTTPS add-on on `TAZRIM_HTTP_PORT=8080`,
  `TAZRIM_HTTPS_PORT=8443`, `TAZRIM_DNS_PORT=5354`, and a locally built image tagged
  `ghcr.io/jordanyefet/tazrim:0.0.0-eng118` (`TAZRIM_VERSION=0.0.0-eng118`).
* Never press "update" in the test install: the helper retags `:latest`, which production uses.
