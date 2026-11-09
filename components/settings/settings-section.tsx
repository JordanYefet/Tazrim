import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * A Settings section page (/settings/<section>): the way back to the Settings
 * home, then the section. Sections whose component has its own heading pass
 * no title.
 */
export function SettingsSection({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="page-in mx-auto max-w-3xl min-w-0 space-y-6">
      <Link
        href="/settings"
        className="-ms-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg pe-3 ps-1 text-sm font-medium text-primary transition-colors duration-quick hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        הגדרות
      </Link>
      {title && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
