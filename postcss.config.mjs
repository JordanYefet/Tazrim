// The a11y plugin (Settings → Accessibility, ENG-128) runs after Tailwind has generated its
// media variants and before autoprefixer.
const config = {
  plugins: {
    tailwindcss: {},
    './postcss/a11y-media.cjs': {},
    autoprefixer: {},
  },
}
export default config
