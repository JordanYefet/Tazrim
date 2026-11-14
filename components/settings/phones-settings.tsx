/**
 * Phones and tablets (ENG-122): the address, a QR code and the "keep the address from
 * changing" guide, on /settings/phones and as a step of the first run (ENG-125).
 * A stub until ENG-122 lands; it keeps this export.
 */
export function PhonesSettings({ inSetup }: { inSetup?: boolean }) {
  return <p className="text-sm text-muted-foreground" data-in-setup={inSetup ? '' : undefined}>ההגדרות של טלפונים וטאבלטים יופיעו כאן.</p>
}
