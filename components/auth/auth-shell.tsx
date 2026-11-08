import { AppGallery } from './app-gallery'

/**
 * The sign-in, first-run and invite pages' frame (ENG-89): a soft gradient
 * that drifts slowly behind a solid card. With `gallery`, on wide screens the
 * card sits on the right and screenshots of the app turn over on the left.
 */
export function AuthShell({ children, gallery = false }: { children: React.ReactNode; gallery?: boolean }) {
  return (
    <div className="relative isolate flex min-h-dvh overflow-hidden">
      <div aria-hidden className="auth-gradient pointer-events-none absolute -inset-[20%] -z-10" />
      {gallery ? (
        <div className="grid w-full lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div className="flex items-center justify-center p-4 py-10 lg:p-12">{children}</div>
          <div className="hidden min-w-0 items-center justify-center py-12 pe-4 lg:flex xl:pe-16">
            <AppGallery />
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-center p-4 py-10">{children}</div>
      )}
    </div>
  )
}

/** The app's mark, as in the sidebar, at the sign-in card's size; the sign-in page's heading */
export function BrandMark() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-primary shadow-[0_8px_24px_hsl(var(--primary)/0.28)]">
        <span className="text-[38px] font-extrabold leading-none text-primary-foreground">ת</span>
      </span>
      <h1 className="text-[26px] font-extrabold tracking-tight">תזרים</h1>
    </div>
  )
}
