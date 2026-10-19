import { brandIcon } from '@/lib/brand/icon'

// iOS home-screen icon: full-bleed square, iOS rounds the corners itself
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return brandIcon(size.width, 'square')
}
