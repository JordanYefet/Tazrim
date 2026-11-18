import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The a11y plugin (Settings → Accessibility, ENG-128) runs after Tailwind has generated its
// media variants and before autoprefixer. Its key is an absolute path: Next resolves plugin
// names from its own build folder, where a relative path would not be found.
const a11yMedia = path.join(path.dirname(fileURLToPath(import.meta.url)), 'postcss', 'a11y-media.cjs')

const config = {
  plugins: {
    tailwindcss: {},
    [a11yMedia]: {},
    autoprefixer: {},
  },
}
export default config
