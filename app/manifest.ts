import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand/colors'

// Web app manifest: lets Chrome/Edge install the app into its own window and phones add it to the home screen
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'תזרים',
    short_name: 'תזרים',
    description: 'ניהול פיננסי אישי: תזרים מזומנים, חשבונות בנק וכרטיסי אשראי',
    lang: 'he',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Title bar matches the light header; the page's theme-color meta switches it in dark mode
    theme_color: BRAND.lightCard,
    background_color: BRAND.lightBackground,
    icons: [
      { src: '/pwa-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
