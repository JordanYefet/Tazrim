/**
 * "Show the sync browser" (ENG-104): a switch for the debug page that opens the
 * bank sync's browser window while debugging a login. Held in the server's memory,
 * so it is off again after every start. It adds to TAZRIM_SYNC_SHOW_BROWSER, never
 * overrides it. Only where a window can open: the Docker image's browser has no screen.
 */

const KEY = Symbol.for('tazrim.log.showBrowser')
const g = globalThis as unknown as Record<symbol, { on: boolean }>
const flag = (g[KEY] ??= { on: false })

/** Running in the Docker image (its Dockerfile sets these), where the browser runs without a screen */
export function inDocker(): boolean {
  return process.env.TAZRIM_IN_DOCKER === '1' || !!process.env.TAZRIM_CHROMIUM_ARGS?.trim()
}

export const getShowBrowser = () => flag.on

export function setShowBrowser(on: boolean) {
  flag.on = on
}

/** What realScrape uses: the switch or the environment variable */
export function showSyncBrowser(): boolean {
  return flag.on || process.env.TAZRIM_SYNC_SHOW_BROWSER === '1'
}
