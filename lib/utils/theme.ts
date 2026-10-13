export type ThemeValue = 'light' | 'dark' | 'system'

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeValue; label: string }> = [
  { value: 'light', label: 'בהיר' },
  { value: 'dark', label: 'כהה' },
  { value: 'system', label: 'מערכת' },
]

/** Map whatever next-themes reports to one of our options (unknown → system). */
export function normalizeTheme(theme: string | undefined): ThemeValue {
  return THEME_OPTIONS.some(o => o.value === theme) ? (theme as ThemeValue) : 'system'
}

/** Next/previous option with wrap-around, for arrow-key navigation. */
export function stepTheme(current: ThemeValue, dir: 1 | -1): ThemeValue {
  const i = THEME_OPTIONS.findIndex(o => o.value === current)
  const n = THEME_OPTIONS.length
  return THEME_OPTIONS[(i + dir + n) % n].value
}
