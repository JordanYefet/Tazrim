import { brandIcon } from '@/lib/brand/icon'

// Install icons referenced by app/manifest.ts, rendered once at build time
const ICONS = {
  'icon-192.png': { size: 192, variant: 'rounded' },
  'icon-512.png': { size: 512, variant: 'rounded' },
  'maskable-512.png': { size: 512, variant: 'maskable' },
} as const

export const dynamicParams = false

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }))
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const icon = ICONS[file as keyof typeof ICONS]
  if (!icon) return new Response('Not found', { status: 404 })
  return brandIcon(icon.size, icon.variant)
}
