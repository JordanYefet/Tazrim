'use client'

/**
 * Encrypted connection (ENG-123): one switch turns on Caddy (HTTPS) and AdGuard Home (the
 * .internal names) through the helper; a second opens AdGuard's plain DNS to the home network for
 * Android and other computers. The certificate files come from Tazrim itself (/tazrim.mobileconfig,
 * /tazrim-root.crt), each with a QR code a phone scans on the Wi-Fi. Guides: iPhone/iPad, Android
 * (certificate, then names), other computers.
 *
 * Settings → Phones and network renders <HttpsSection> as its second section, with the page's one
 * settings object. /setup (ENG-125) renders <HttpsSettings inSetup />, which loads its data from
 * /api/install and /api/install/network and shows only the essentials: the switch, the address and
 * the two files.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Download, Monitor, Network, Smartphone, TabletSmartphone } from 'lucide-react'
import type { ConfigValues, InstallView, NetworkInfo } from '@/lib/install/types'
import { httpsAddress, isHttpsOn, phoneAddress, withHttps } from '@/lib/install/addresses'
import { cn } from '@/lib/utils/cn'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { ContainerApplyStatus, ManualEnvSteps, SwitchButton, useContainerSettings, type ContainerSettings } from '@/components/install/container-settings'
import {
  AddressLine,
  CopyLine,
  OldUpdaterNote,
  GuideList,
  GuideWindow,
  InstallLoading,
  Note,
  QrImage,
  SectionHeading,
  Steps,
  Ui,
  sectionClass,
  useOpenGuide,
  type GuideItem,
} from '@/components/install/guide'
import { fetchNetwork, useInstallData } from '@/components/install/use-install-data'
import { LINK, NETWORK_PAGE } from '@/components/settings/phones-settings'

export const PROFILE_FILE = '/tazrim.mobileconfig'
export const CERT_FILE = '/tazrim-root.crt'

export function HttpsSettings({ inSetup, initial, network }: { inSetup?: boolean; initial?: InstallView; network?: NetworkInfo }) {
  const data = useInstallData(initial, network)
  if (!data.view || !data.network) return <InstallLoading failed={data.failed} retry={data.retry} plain={!!inSetup} />
  return <Https inSetup={!!inSetup} initial={data.view} network={data.network} />
}

/** On its own (/setup, tests): the section; outside /setup its guides too */
function Https({ inSetup, initial, network }: { inSetup: boolean; initial: InstallView; network: NetworkInfo }) {
  const settings = useContainerSettings(initial)
  const { values } = settings
  const guides = httpsGuides({ url: httpsAddress(values.TAZRIM_HOST, network.httpsPort), base: phoneAddress(values), ip: values.TAZRIM_LAN_IP, values })
  const [open, setOpen] = useOpenGuide(guides)
  return (
    <div className="space-y-4">
      <HttpsSection settings={settings} network={network} inSetup={inSetup} />
      {!inSetup && <GuideList title="מדריכים" groups={[{ title: 'HTTPS', guides }]} onOpen={setOpen} />}
      <GuideWindow guides={guides} open={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** A switch row: label and line on one side, the switch on the other */
function SwitchRow({
  id,
  label,
  description,
  on,
  disabled,
  busy,
  onToggle,
  settings,
  secondary = false,
}: {
  id: string
  label: string
  description: React.ReactNode
  on: boolean
  disabled: boolean
  busy: boolean
  onToggle: () => void
  settings: ContainerSettings
  secondary?: boolean
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <span className="space-y-0.5">
        <span id={`${id}-label`} className={cn('block font-medium', secondary ? 'text-sm' : 'text-[0.9375rem]')}>
          {label}
        </span>
        <span className="block text-xs text-muted-foreground text-pretty">{description}</span>
      </span>
      <SwitchButton on={on} labelledBy={`${id}-label`} busy={busy} disabled={!settings.canApply || settings.busy || disabled} onClick={onToggle} />
    </div>
  )
}

/**
 * One downloadable file: its QR code (for a phone looking at this screen) and a download button
 * (for this browser). Two of them side by side, the same size; while HTTPS is off they stay where
 * they are, dimmed, and say what comes first.
 */
function DeviceFile({
  title,
  line,
  file,
  base,
  state,
  onRecheck,
  small,
}: {
  title: string
  line: string
  file: string
  /** http://<computer>:<phone port>, or null while the address is unknown */
  base: string | null
  state: 'off' | 'waiting' | 'ready'
  onRecheck: () => void
  small: boolean
}) {
  const ready = state === 'ready'
  return (
    <div className="pop-in flex flex-col items-center gap-3 rounded-xl bg-muted/60 px-3 py-4 text-center dark:bg-muted/40">
      <span className={cn('space-y-0.5 transition-opacity duration-200', state === 'off' && 'opacity-50')}>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{line}</span>
      </span>
      {/* On a phone the button is the way; the code is for a phone looking at a computer's screen */}
      <span className={cn('hidden transition-opacity duration-200 sm:block', state === 'off' && 'opacity-50')} aria-hidden={!ready || undefined}>
        <QrImage url={ready && base ? base + file : null} size={small ? 96 : 112} label={`קוד QR להורדת ${file.slice(1)}`} />
      </span>
      <span className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground">
        {state === 'ready' ? (
          <>
            <a
              href={file}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium text-foreground transition-[background-color,transform] duration-[120ms] ease-out hover-fine:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-4 w-4" aria-hidden />
              הורדה
            </a>
            <bdi dir="ltr" className="break-all font-mono text-[0.6875rem]">
              {file.slice(1)}
            </bdi>
          </>
        ) : state === 'waiting' ? (
          <span className="flex flex-col items-center">
            האישור עוד נוצר.
            <button type="button" onClick={onRecheck} className={cn(LINK, 'px-1 py-1')}>
              בדיקה שוב
            </button>
          </span>
        ) : (
          <span className="font-medium">קודם מפעילים HTTPS</span>
        )}
      </span>
    </div>
  )
}

/**
 * The section: what comes first, the switch, the address it gives, the two files, and (on the
 * Settings page) the names for Android and other computers as a quieter row. Without the helper,
 * one "הצגת שלבים ידניים" for both switches.
 */
export function HttpsSection({
  settings,
  network,
  inSetup = false,
  onGuide,
}: {
  settings: ContainerSettings
  network: NetworkInfo
  inSetup?: boolean
  /** Opens a guide on the page (the one to keep the address); without it, a link to the page */
  onGuide?: (id: string) => void
}) {
  const { values } = settings
  const [net, setNet] = useState(network)
  const on = isHttpsOn(values.COMPOSE_PROFILES)
  const lanDns = values.TAZRIM_DNS_BIND === '0.0.0.0'
  const ip = values.TAZRIM_LAN_IP
  const url = httpsAddress(values.TAZRIM_HOST, net.httpsPort)
  const base = phoneAddress(values)
  const profilesBusy = settings.busy && settings.changingKeys.includes('COMPOSE_PROFILES')
  const lanBusy = settings.busy && settings.changingKeys.includes('TAZRIM_DNS_BIND')

  // After a change (HTTPS just turned on, say) Caddy makes its certificate: look again
  async function recheck() {
    const n = await fetchNetwork()
    if (n) setNet(n)
  }
  useEffect(() => {
    if (settings.phase === 'done') void recheck()
  }, [settings.phase])

  const fileState = !on ? 'off' : net.certReady ? 'ready' : 'waiting'
  const nextProfiles = withHttps(values.COMPOSE_PROFILES, !on, settings.canApply)
  const job = settings.view.job
  const portBusy =
    settings.phase === 'failed' && job?.code === 'PORT_BUSY' && job.keys.some(k => k === 'COMPOSE_PROFILES' || k === 'TAZRIM_DNS_BIND')

  const prerequisite = inSetup ? (
    ip ? null : 'עוד לא ידוע מה הכתובת של המחשב. קובעים אותה בשלב הקודם.'
  ) : (
    <>
      צריך קודם כתובת קבועה למחשב, אחרת זה יפסיק לעבוד כשהנתב יחליף אותה.{' '}
      {onGuide ? (
        <button type="button" onClick={() => onGuide('reserve')} className={LINK}>
          איך שומרים כתובת קבועה
        </button>
      ) : (
        <Link href={`${NETWORK_PAGE}?guide=reserve`} className={LINK}>
          איך שומרים כתובת קבועה
        </Link>
      )}
      {!ip && (
        <>
          <br />
          עוד לא ידוע מה הכתובת של המחשב. קובעים אותה ב
          <Link href={`${NETWORK_PAGE}#advanced`} className={LINK}>
            מתקדם
          </Link>
          .
        </>
      )}
    </>
  )

  return (
    <section
      id={inSetup ? undefined : 'https'}
      aria-labelledby={inSetup ? undefined : 'https-title'}
      aria-label={inSetup ? 'חיבור מוצפן' : undefined}
      className={cn('scroll-mt-6 space-y-4', sectionClass(inSetup))}
    >
      {inSetup ? (
        prerequisite && <p className="text-sm text-pretty">{prerequisite}</p>
      ) : (
        <SectionHeading id="https-title" line={prerequisite}>
          חיבור מוצפן (HTTPS)
        </SectionHeading>
      )}

      <SwitchRow
        id="https-switch"
        label="HTTPS ושמות מקומיים"
        description="מפעיל במחשב הזה את Caddy (חיבור מוצפן) ואת AdGuard Home (השמות). משתמש בפורטים 80, 443 ו-53."
        on={on}
        disabled={!on && !ip}
        busy={profilesBusy}
        onToggle={() => void settings.apply({ COMPOSE_PROFILES: nextProfiles })}
        settings={settings}
      />

      <div className={cn('space-y-1 transition-opacity duration-200', !on && 'opacity-50')}>
        <p className="text-xs text-muted-foreground">{on ? 'הכתובת המוצפנת' : 'הכתובת המוצפנת, אחרי ההפעלה'}</p>
        <AddressLine url={url} className={inSetup ? 'text-[0.9375rem] sm:text-lg' : 'text-[0.9375rem] sm:text-xl'} disabled={!on} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DeviceFile small={inSetup} title="iPhone ו-iPad" line="פרופיל: האישור והשמות" file={PROFILE_FILE} base={base} state={fileState} onRecheck={recheck} />
        <DeviceFile small={inSetup} title="Android ומחשבים" line="האישור לבדו" file={CERT_FILE} base={base} state={fileState} onRecheck={recheck} />
      </div>

      {!inSetup && (
        <div className={cn('border-t pt-3 transition-opacity duration-200', !on && 'opacity-50')}>
          <SwitchRow
            secondary
            id="https-lan-dns"
            label="שמות גם ל-Android ולמחשבים אחרים"
            description="פותח את ה-DNS של המחשב (פורט 53) לרשת הביתית. ל-iPhone ו-iPad לא צריך."
            on={on && lanDns}
            disabled={!on}
            busy={lanBusy}
            onToggle={() => void settings.apply({ TAZRIM_DNS_BIND: lanDns ? null : '0.0.0.0' })}
            settings={settings}
          />
        </div>
      )}

      {!settings.canApply && settings.view.helper === 'old' && <OldUpdaterNote />}
      {!settings.canApply && (
        <ManualEnvSteps
          lines={inSetup ? [`COMPOSE_PROFILES=${nextProfiles}`] : [`COMPOSE_PROFILES=${nextProfiles}`, `TAZRIM_DNS_BIND=${lanDns ? '127.0.0.1' : '0.0.0.0'}`]}
          installDir={settings.view.installDir}
        />
      )}

      {settings.canApply &&
        (portBusy ? (
          <p aria-live="polite" className="min-h-5 text-xs text-destructive text-pretty">
            פורט 80, 443 או 53 תפוס בתוכנה אחרת במחשב, וההגדרה הקודמת חזרה. סוגרים את התוכנה, או קובעים ב-<bdi dir="ltr">.env</bdi> פורטים אחרים:{' '}
            <bdi dir="ltr" className="font-mono">
              TAZRIM_HTTP_PORT, TAZRIM_HTTPS_PORT, TAZRIM_DNS_PORT
            </bdi>
          </p>
        ) : (
          <ContainerApplyStatus settings={settings} only={['COMPOSE_PROFILES', 'TAZRIM_DNS_BIND']} />
        ))}
    </section>
  )
}

/** The HTTPS guides: iPhone and iPad, the Android certificate, the Android names, other computers */
export function httpsGuides({ url, base, ip, values }: { url: string; base: string | null; ip: string; values: ConfigValues }): GuideItem[] {
  const tazrimIp = ip || '192.168.1.20'
  return [
    {
      id: 'iphone',
      icon: TabletSmartphone,
      title: 'iPhone ו-iPad',
      summary: 'פרופיל אחד: האישור והשמות.',
      body: (
        <>
          <Steps>
            <li>
              פותחים ב-Safari את הקישור לפרופיל, או סורקים את קוד ה-QR שלו במצלמה.
            </li>
            <li>
              הגדרות ← <Ui>פרופיל הורד</Ui> ← <Ui>התקנה</Ui>.
            </li>
            <li>
              הגדרות ← כללי ← אודות ← <Ui>הגדרות אמון באישורים</Ui> ← מפעילים אמון מלא ל-<Ui ltr>Caddy Local Authority</Ui>. בלי זה הכתובת לא נטענת.
            </li>
            <li>
              פותחים את <bdi dir="ltr" className="font-mono">{url}</bdi>, נכנסים ויוצרים מפתח (הגדרות ← אנשים ומכשירים).
            </li>
          </Steps>
          <Note>בחלק מגרסאות iOS 18 המתג באמון באישורים לא הופיע. זה תוקן ב-iOS 18.2. גם הסרה של הפרופיל והתקנה מחדש עוזרות.</Note>
          <Note>
            עם VPN (למשל WireGuard): משאירים ריק את <Ui ltr>DNS servers</Ui> בחיבור, אחרת השמות לא עובדים כשהוא מחובר. אם הכתובת של המחשב משתנה, מתקינים את הפרופיל מחדש.
          </Note>
        </>
      ),
    },
    {
      id: 'android',
      icon: Smartphone,
      title: 'האישור ב-Android',
      summary: 'מתקינים את האישור מההגדרות של הטלפון.',
      body: (
        <>
          <p className="text-pretty">מאז Android 11 מתקינים אישור רק מאפליקציית ההגדרות:</p>
          <Steps>
            <li>מורידים את הקובץ <bdi dir="ltr" className="font-mono">tazrim-root.crt</bdi> (הקישור או קוד ה-QR שלו).</li>
            <li>
              הגדרות ← אבטחה ← הגדרות אבטחה נוספות ← <Ui>הצפנה ופרטי כניסה</Ui> ← <Ui>התקנת אישור</Ui> ← <Ui>אישור CA</Ui>.
            </li>
            <li>
              <Ui>התקנה בכל זאת</Ui>, ובוחרים את <bdi dir="ltr" className="font-mono">tazrim-root.crt</bdi> מההורדות.
            </li>
          </Steps>
          <Note>השמות בתפריט שונים בין יצרנים. לא מוצאים? מחפשים בהגדרות &quot;אישור&quot;, &quot;תעודה&quot; או &quot;certificate&quot;.</Note>
          <Note>Chrome סומך על האישור, וגם תזרים כשהוא מותקן כאפליקציה. אחר כך: &quot;השמות ב-Android&quot;.</Note>
          <Note tone="warn">ייתכן שמפתח לא יעבוד ב-Android עם אישור שהותקן כך. סיסמה תמיד עובדת.</Note>
        </>
      ),
    },
    {
      id: 'android-names',
      icon: Network,
      title: 'השמות ב-Android',
      summary: 'הטלפון שואל את המחשב על השמות, ברשת הביתית.',
      body: (
        <>
          <p className="text-pretty">
            ל-Android אין דרך לשאול על שמות <bdi dir="ltr">.internal</bdi> בלבד, ו-<Ui>DNS פרטי</Ui> (Private DNS) לא מתאים כאן. לכן הטלפון שואל את המחשב על כל השמות. קודם מפעילים כאן את &quot;שמות גם ל-Android ולמחשבים אחרים&quot;.
          </p>
          <Steps>
            <li>
              הגדרות ← <Ui ltr>Wi-Fi</Ui> ← הרשת הביתית ← עריכה (או <Ui>מתקדם</Ui>).
            </li>
            <li>
              <Ui>הגדרות IP</Ui>: מ-<Ui ltr>DHCP</Ui> ל-<Ui>סטטי</Ui>. את הכתובת ואת השער משאירים כמו שהם.
            </li>
            <li>
              <span className="block">
                <Ui ltr>DNS 1</Ui>: הכתובת של המחשב. שומרים.
              </span>
              <CopyLine text={tazrimIp} className="mt-1" />
            </li>
          </Steps>
          <Note tone="warn">כשהמחשב כבוי, לטלפון הזה עלול לא להיות אינטרנט ברשת הזו. חזרה ל-DHCP מבטלת את השינוי.</Note>
          <Note>
            בלי השלב הזה הטלפון עדיין נכנס עם סיסמה בכתובת{' '}
            <bdi dir="ltr" className="font-mono">
              {base ?? 'http://<המחשב>:' + values.TAZRIM_PHONE_PORT}
            </bdi>
            . שמות <bdi dir="ltr">.local</bdi> לא אמינים ב-Chrome ב-Android.
          </Note>
          <Note>למתקדמים: אפשר לקבוע בנתב את המחשב כ-DNS לכל הבית. אז כשהמחשב כבוי, כל הבית עלול להישאר בלי אינטרנט.</Note>
        </>
      ),
    },
    {
      id: 'computers',
      icon: Monitor,
      title: 'מחשבים אחרים',
      summary: 'Mac או Windows שאינם המחשב הזה.',
      body: <OtherComputers ip={tazrimIp} port={values.TAZRIM_PORT} />,
    },
  ]
}

/** Mac and Windows: trust the certificate, then send .internal to this computer */
function OtherComputers({ ip, port }: { ip: string; port: string }) {
  const [os, setOs] = useState<'mac' | 'windows'>('mac')
  return (
    <>
      <SegmentedTabs
        ariaLabel="מערכת הפעלה"
        value={os}
        onChange={setOs}
        options={[
          { key: 'mac', label: 'Mac' },
          { key: 'windows', label: 'Windows' },
        ]}
      />
      {os === 'mac' ? (
        <Steps>
          <li>
            מורידים את <bdi dir="ltr" className="font-mono">tazrim-root.crt</bdi> ולוחצים עליו פעמיים. ב-<Ui ltr>Keychain Access</Ui> בוחרים <Ui ltr>System</Ui>.
          </li>
          <li>
            פותחים את האישור ברשימה, ותחת <Ui ltr>Trust</Ui> בוחרים <Ui ltr>Always Trust</Ui>.
          </li>
          <li>
            <span className="block">השמות: בטרמינל (עם &quot;שמות גם ל-Android ולמחשבים אחרים&quot; פעיל):</span>
            <CopyLine className="mt-1" text={`sudo mkdir -p /etc/resolver && echo "nameserver ${ip}" | sudo tee /etc/resolver/internal`} />
          </li>
        </Steps>
      ) : (
        <Steps>
          <li>
            לוחצים פעמיים על <bdi dir="ltr" className="font-mono">tazrim-root.crt</bdi> ← <Ui ltr>Install Certificate</Ui> ← <Ui ltr>Local Machine</Ui>.
          </li>
          <li>
            <Ui ltr>Place all certificates in the following store</Ui> ← <Ui ltr>Trusted Root Certification Authorities</Ui> ← <Ui ltr>Finish</Ui>.
          </li>
          <li>
            <span className="block">השמות: ב-PowerShell כמנהל (עם &quot;שמות גם ל-Android ולמחשבים אחרים&quot; פעיל):</span>
            <CopyLine className="mt-1" text={`Add-DnsClientNrptRule -Namespace ".internal" -NameServers "${ip}"`} />
          </li>
        </Steps>
      )}
      <Note>
        הפקודה שולחת למחשב של תזרים רק שמות <bdi dir="ltr">.internal</bdi>, וכל השאר ממשיך כרגיל. במחשב שתזרים רץ עליו לא צריך כלום:{' '}
        <bdi dir="ltr" className="font-mono">
          http://localhost:{port}
        </bdi>
        .
      </Note>
    </>
  )
}
