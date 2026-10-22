/*
 * The "סרטי צבע" background (ENG-72, the Ribbons mockup): four soft ribbons
 * of colour across the page, blurred. Drawn in a 390 × 640 box stretched to
 * the viewport (they are soft enough that stretching does not show).
 */

export const RIBBON_BOX = { width: 390, height: 640 } as const

/** [path, gradient (0-2), opacity light, opacity dark] */
export const RIBBONS: ReadonlyArray<readonly [string, 0 | 1 | 2, number, number]> = [
  ['M0 150 C 110 90, 220 250, 390 120 L390 250 C 250 330, 130 200, 0 290 Z', 0, 0.9, 0.9],
  ['M0 250 C 130 190, 240 340, 390 230 L390 330 C 240 410, 120 300, 0 380 Z', 1, 0.8, 0.85],
  ['M0 420 C 120 360, 260 500, 390 400 L390 520 C 250 590, 130 480, 0 560 Z', 2, 0.75, 0.8],
  ['M0 500 C 140 470, 250 580, 390 520 L390 600 C 260 650, 120 570, 0 640 Z', 0, 0.6, 0.6],
]

/** Left-to-right colour stops of the three gradients (the mockup's violet palette). */
export const RIBBON_GRADIENTS = {
  light: [
    ['#c4b5fd', '#e9d5ff'],
    ['#f9a8d4', '#c4b5fd'],
    ['#bfdbfe', '#ddd6fe'],
  ],
  dark: [
    ['#3b0f8f', '#7c3aed'],
    ['#db2777', '#6d28d9'],
    ['#1e3a8a', '#6d28d9'],
  ],
} as const

/** How far the (blurred) ribbon layer reaches past the viewport, CSS px (.bg-layer--ribbons) */
export const RIBBON_BLEED = 40

/** Blur of the ribbons, CSS px */
export const RIBBON_BLUR = { light: 16, dark: 14 } as const
