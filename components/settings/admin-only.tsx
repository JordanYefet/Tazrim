import { cn } from '@/lib/utils/cn'

/**
 * Settings that are for admins (ENG-140). An admin sees the section as it is. A member sees the
 * same section, dimmed and inert, under one line saying why, so the page keeps its shape.
 */
export function AdminOnly({ admin, children, className }: { admin: boolean; children: React.ReactNode; className?: string }) {
  if (admin) return <>{children}</>
  return (
    <div className={cn('space-y-4', className)}>
      <p role="note" className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty">את ההגדרות האלה משנים מנהלים ומנהלות. אפשר לראות אותן, אבל לא לשנות.</p>
      <div inert aria-disabled="true" className="pointer-events-none select-none space-y-6 opacity-50">
        {children}
      </div>
    </div>
  )
}
