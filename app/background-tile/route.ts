import { parseTileQuery, tileSvg } from '@/lib/background/tile-svg'

/*
 * The page background tile (ENG-72): an SVG the stylesheet repeats on <body>
 * (lib/background/tile-svg.ts). Its URL names everything it depends on, so
 * the browser may keep it for good.
 */
export function GET(req: Request) {
  const parsed = parseTileQuery(new URL(req.url).searchParams)
  const svg = parsed && tileSvg(parsed.setting, parsed.mode)
  if (!svg) return new Response('not found', { status: 404 })
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
