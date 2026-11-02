import type { CSSProperties } from 'react'
import { cssValue, type DesignToken } from '@/lib/design/tokens'

/** One token, drawn the way it's used: a colour, a shadow, a radius or a motion */
export function TokenSwatch({ token }: { token: DesignToken }) {
  const value = cssValue(token)
  const style: CSSProperties =
    token.format === 'shadow' ? { boxShadow: value }
    : token.format === 'length' ? { borderRadius: value }
    : token.format === 'duration' ? { transitionDuration: value }
    : token.format === 'easing' ? { transitionTimingFunction: value }
    : { background: value }
  const box =
    token.format === 'hsl' || token.format === 'color'
      ? 'h-14 rounded-lg border border-border'
      : token.format === 'duration' || token.format === 'easing'
        ? 'h-14 rounded-lg bg-muted transition-transform group-hover:translate-x-2 rtl:group-hover:-translate-x-2'
        : 'h-14 rounded-lg bg-card border border-border'
  return (
    <figure className="group min-w-0">
      <div data-token={token.name} className={box} style={style} />
      <figcaption className="mt-2 space-y-0.5">
        <code dir="ltr" className="block truncate text-xs font-medium">{token.name}</code>
        <span className="block text-xs text-muted-foreground">{token.purpose}</span>
      </figcaption>
    </figure>
  )
}
