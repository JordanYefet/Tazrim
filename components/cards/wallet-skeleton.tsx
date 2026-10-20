/**
 * Placeholder for /cards and a card's page while their data streams in
 * (loading.tsx). The wallet itself stays on screen (app/cards/layout.tsx), so
 * only the page's own blocks are sketched, in the same grid places.
 */
export function WalletPageSkeleton({ variant }: { variant: 'stack' | 'card' }) {
  const block = 'rounded-xl bg-muted/60 motion-safe:animate-pulse'
  return (
    <div className="contents" aria-busy="true" aria-label="טוען">
      {/* The real headings' heights (title, no period line since ENG-64), so the
          wallet does not shift when the page arrives */}
      <div className={`wallet-shell__head space-y-2 ${variant === 'stack' ? 'h-[174px] lg:h-[82px]' : 'h-[109px] lg:h-[57px]'}`}>
        {/* a card's page has the back link above its title */}
        {variant === 'card' && <div className={`${block} h-4 w-28`} />}
        <div className={`${block} h-8 w-48`} />
      </div>
      {variant === 'stack' ? (
        <div className={`wallet-shell__beside ${block} h-72`} />
      ) : (
        <div className="wallet-shell__beside grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className={`${block} h-40`} />
          <div className="grid grid-cols-2 gap-4">
            <div className={`${block} h-28`} />
            <div className={`${block} h-28`} />
          </div>
        </div>
      )}
      <div className={`wallet-shell__rest ${block} h-64`} />
    </div>
  )
}
