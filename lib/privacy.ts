/**
 * Privacy mode (ENG-127): one tap blurs every money amount, for when someone can see
 * the screen. It is kept per browser in a cookie, so the server renders <html
 * data-privacy="on"> and amounts never flash on a load. Every amount carries
 * `data-money`; globals.css blurs those while the mode is on.
 *
 * Not a security feature: the numbers are still in the page.
 */
export const PRIVACY_COOKIE = 'tazrim_privacy'

export function parsePrivacyCookie(value: string | undefined): boolean {
  return value === 'on'
}

export function formatPrivacyCookie(on: boolean): string {
  return on ? 'on' : 'off'
}

/** ⌘⇧. on a Mac, Ctrl+Shift+. elsewhere. By key position, so it works on a Hebrew layout too. */
export function isPrivacyShortcut(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'code'>): boolean {
  return (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'Period'
}
