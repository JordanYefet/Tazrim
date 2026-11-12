import { InsightsSwitch } from '@/components/layout/insights-switch'

// The phone's "תובנות" tab: one switch over three pages (hidden from md up, where the sidebar links them)
export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InsightsSwitch />
      {children}
    </>
  )
}
