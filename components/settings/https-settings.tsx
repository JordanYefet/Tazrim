/**
 * HTTPS and passkeys on phones (ENG-123), on /settings/https and as a step of the
 * first run (ENG-125). A stub until ENG-123 lands; it keeps this export.
 */
export function HttpsSettings({ inSetup }: { inSetup?: boolean }) {
  return <p className="text-sm text-muted-foreground" data-in-setup={inSetup ? '' : undefined}>ההגדרות של HTTPS ומפתחות בטלפון יופיעו כאן.</p>
}
