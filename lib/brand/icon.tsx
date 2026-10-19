import { ImageResponse } from 'next/og'
import { BRAND } from './colors'

// The letter "ת" from Heebo Bold (the app's font, OFL), as an outline path.
// Drawing the glyph as a path keeps icon generation free of font files and network fetches.
const TAV_PATH =
  'M697 0Q933 0 1053 114Q1174 228 1174 454V1197H874L871 429Q871 331 829 283Q787 235 699 235H543Q525 291 516 358Q507 426 507 487V836Q507 1017 412 1115Q317 1214 148 1214Q107 1214 73 1210Q38 1207 0 1201V968Q16 969 33 970Q49 970 66 970Q138 970 176 932Q213 894 213 813V514Q213 451 230 371Q247 292 284 235H93V0Z'
const TAV_W = 1174
const TAV_H = 1214

type Variant =
  /** Rounded square on a transparent canvas, like the sidebar logo (favicon, "any" manifest icons). */
  | 'rounded'
  /** Full-bleed square; the platform applies its own mask (apple-touch-icon). */
  | 'square'
  /** Full-bleed with the glyph well inside the 80% maskable safe zone. */
  | 'maskable'

/** Renders the brand mark (white "ת" on the primary colour) as a PNG of the given size. */
export function brandIcon(size: number, variant: Variant) {
  // Glyph height as a share of the canvas: smaller on maskable so it survives a circle mask
  const glyphH = Math.round(size * (variant === 'maskable' ? 0.36 : variant === 'square' ? 0.46 : 0.5))
  const glyphW = Math.round((glyphH * TAV_W) / TAV_H)
  const radius = variant === 'rounded' ? Math.round(size * 0.22) : 0

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: BRAND.primary,
          borderRadius: radius,
        }}
      >
        <svg width={glyphW} height={glyphH} viewBox={`0 0 ${TAV_W} ${TAV_H}`}>
          <path d={TAV_PATH} fill={BRAND.white} />
        </svg>
      </div>
    ),
    { width: size, height: size }
  )
}
