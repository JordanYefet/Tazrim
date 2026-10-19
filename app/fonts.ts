import localFont from 'next/font/local'

// Heebo (SIL OFL) is served from the app itself so a page view never contacts a third party
// and the font works offline. The variable files come from the @fontsource-variable/heebo npm
// package, so neither build nor runtime needs the network. Google ships Heebo as the same
// per-script subsets; each subset is its own family here and Tailwind's `font-sans` lists both,
// so Hebrew glyphs come from the Hebrew file and Latin text/digits from the Latin one.
// next/font needs literal option values, hence the repeated paths.
export const heeboHebrew = localFont({
  src: '../node_modules/@fontsource-variable/heebo/files/heebo-hebrew-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heebo-hebrew',
  // The generated metric fallback has no unicode-range, so it would sit between the two subsets
  // in the font stack and catch Latin text before heeboLatin; the Latin instance keeps its own.
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F' }],
})

export const heeboLatin = localFont({
  src: '../node_modules/@fontsource-variable/heebo/files/heebo-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-heebo-latin',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
})
