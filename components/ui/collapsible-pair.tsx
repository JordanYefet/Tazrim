import { cn } from '@/lib/utils/cn'

/** Grid tracks per state; fr tracks interpolate, so the change animates */
const TRACKS = {
  both: 'grid-rows-[1fr_1fr] gap-y-4 lg:grid-rows-[1fr] lg:grid-cols-[1fr_1fr] lg:gap-x-4 lg:gap-y-0',
  first: 'grid-rows-[1fr_0fr] gap-y-0 lg:grid-rows-[1fr] lg:grid-cols-[1fr_0fr] lg:gap-x-0',
  second: 'grid-rows-[0fr_1fr] gap-y-0 lg:grid-rows-[1fr] lg:grid-cols-[0fr_1fr] lg:gap-x-0',
} as const

/**
 * Two cards side by side (stacked on phones), equal widths. Hiding one
 * collapses it while the other widens to the full row, instead of the card
 * vanishing: both stay mounted, so the grid tracks and the fade transition.
 */
export function CollapsiblePair({
  show,
  first,
  second,
}: {
  show: keyof typeof TRACKS
  /** The start side (right, in RTL) */
  first: React.ReactNode
  second: React.ReactNode
}) {
  const cell = (visible: boolean, node: React.ReactNode) => (
    <div
      aria-hidden={!visible || undefined}
      inert={!visible || undefined}
      className={cn(
        'min-h-0 min-w-0 overflow-hidden transition-opacity duration-base ease-ui',
        visible ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* The content keeps its side-by-side width (half the row, cqw of the pair): a
          collapsing column clips its card instead of re-wrapping it taller, which
          would stretch the row and leave a gap under the other card */}
      <div className="lg:min-w-[calc(50cqw-0.5rem)]">{node}</div>
    </div>
  )
  return (
    <div
      className={cn(
        'grid [container-type:inline-size] transition-[grid-template-columns,grid-template-rows,gap] duration-base ease-ui motion-reduce:transition-none',
        TRACKS[show]
      )}
    >
      {cell(show !== 'second', first)}
      {cell(show !== 'first', second)}
    </div>
  )
}
