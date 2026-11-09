import { LoginStory } from './login-story'

/**
 * The sign-in, first-run and invite pages' frame (ENG-89): a soft gradient
 * that drifts slowly behind a solid card. With `story`, what the app is and
 * why it was built: beside the card on wide screens, under it on phones.
 */
export function AuthShell({ children, story = false }: { children: React.ReactNode; story?: boolean }) {
  return (
    <div className="relative isolate flex min-h-dvh overflow-hidden">
      <div aria-hidden className="auth-gradient pointer-events-none absolute -inset-[20%] -z-10" />
      {story ? (
        <div className="grid w-full lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
          <div className="flex items-center justify-center p-4 py-10 lg:p-12">{children}</div>
          <div className="flex min-w-0 items-center justify-center px-5 pb-12 lg:py-12 lg:pe-12 lg:ps-4 xl:pe-16">
            <LoginStory />
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-center p-4 py-10">{children}</div>
      )}
    </div>
  )
}

/** The app's mark beside its name, as in the sidebar; the sign-in page's heading */
export function BrandMark() {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary shadow-[0_6px_18px_hsl(var(--primary)/0.28)]">
        <span className="text-[28px] font-extrabold leading-none text-primary-foreground">ת</span>
      </span>
      <h1 className="text-[26px] font-extrabold tracking-tight">תזרים</h1>
    </div>
  )
}
