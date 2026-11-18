'use client'

/**
 * Settings → Phones and network (/settings/network): what used to be three pages (installation,
 * phones and tablets, HTTPS), as one, in the order people need it: opening Tazrim from a phone
 * (#phones), the encrypted connection (#https), every guide in one list, and the computer's
 * address and ports (#advanced). One settings object for the page, so a change in one section
 * shows in the others at once.
 */
import type { InstallView, NetworkInfo } from '@/lib/install/types'
import { httpsAddress, phoneAddress } from '@/lib/install/addresses'
import { useContainerSettings } from '@/components/install/container-settings'
import { AdvancedSection } from '@/components/install/install-settings'
import { GuideList, GuideWindow, useOpenGuide } from '@/components/install/guide'
import { PhoneSection, phoneGuides } from './phones-settings'
import { HttpsSection, httpsGuides } from './https-settings'

export function NetworkSettings({ initial, network }: { initial: InstallView; network: NetworkInfo }) {
  const settings = useContainerSettings(initial)
  const { values } = settings
  const phone = phoneGuides(values.TAZRIM_LAN_IP)
  const https = httpsGuides({ url: httpsAddress(values.TAZRIM_HOST, network.httpsPort), base: phoneAddress(values), ip: values.TAZRIM_LAN_IP, values })
  const all = [...phone, ...https]
  const [open, setOpen] = useOpenGuide(all)

  return (
    <div className="space-y-4">
      <PhoneSection settings={settings} network={network} />
      <HttpsSection settings={settings} network={network} onGuide={setOpen} />
      <GuideList
        id="guides"
        title="מדריכים"
        groups={[
          { title: 'הטלפון', guides: phone },
          { title: 'HTTPS', guides: https },
        ]}
        onOpen={setOpen}
      />
      <AdvancedSection settings={settings} />
      <GuideWindow guides={all} open={open} onClose={() => setOpen(null)} />
    </div>
  )
}
