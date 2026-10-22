import { BACKGROUND_PALETTES, DEFAULT_BACKGROUND, clampStrength, type BackgroundKind, type BackgroundPalette, type BackgroundSetting } from './setting'

/**
 * The background setting as the stylesheet sees it: the attributes and
 * --bg-strength on <html> (set by the server from the cookie, kept current
 * by components/background/background-provider.tsx).
 */
export function readBackgroundSetting(root: { dataset: DOMStringMap; style: { getPropertyValue(name: string): string } }): BackgroundSetting {
  const kind = root.dataset.bg as BackgroundKind | undefined
  const palette = root.dataset.bgPalette as BackgroundPalette | undefined
  const strength = parseFloat(root.style.getPropertyValue('--bg-strength'))
  return {
    kind: kind === 'plain' || kind === 'lines' || kind === 'ribbons' ? kind : DEFAULT_BACKGROUND.kind,
    palette: palette && BACKGROUND_PALETTES.some(p => p.value === palette) ? palette : DEFAULT_BACKGROUND.palette,
    strength: Number.isFinite(strength) ? clampStrength(strength * 100) : DEFAULT_BACKGROUND.strength,
  }
}
