import { cn } from '@/lib/utils/cn'

/**
 * Two cards side by side (stacked on phones), equal widths and heights. One
 * can be dimmed: it keeps its place and size, fades and loses its colour, and
 * stops taking clicks and focus (inert), so a filter to one side reads as "the
 * other side is off" without the layout moving.
 */
export function DimmablePair({
  dim,
  first,
  second,
}: {
  /** The side that's off, if any */
  dim?: 'first' | 'second'
  /** The start side (right, in RTL) */
  first: React.ReactNode
  second: React.ReactNode
}) {
  const cell = (off: boolean, node: React.ReactNode) => (
    <div
      aria-disabled={off || undefined}
      inert={off || undefined}
      className={cn(
        // Opacity and filter only: no movement, so it stays on under reduced motion
        'min-w-0 transition-[opacity,filter] duration-base ease-ui lg:[&>*]:h-full',
        off && 'opacity-40 grayscale'
      )}
    >
      {node}
    </div>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cell(dim === 'first', first)}
      {cell(dim === 'second', second)}
    </div>
  )
}
