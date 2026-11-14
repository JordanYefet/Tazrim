'use client'

/**
 * Settings → HTTPS and passkeys on the phone (ENG-123): one switch turns on Caddy (HTTPS) and
 * AdGuard Home (the .internal names) through the helper; a second opens AdGuard's plain DNS to the
 * home network for Android and other computers. The certificate files come from Tazrim itself
 * (/tazrim.mobileconfig, /tazrim-root.crt), each with a QR code a phone scans on the Wi-Fi.
 * Guides: iPhone/iPad, Android (certificate, then names), other computers.
 *
 * /settings/https passes `initial` and `network`; /setup (ENG-125) renders <HttpsSettings inSetup />
 * and the data loads from /api/install and /api/install/network.
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Laptop, Monitor, Network, Smartphone, TabletSmartphone } from 'lucide-react'
import type { InstallView, NetworkInfo } from '@/lib/install/types'
import { httpsAddress, isHttpsOn, phoneAddress, withHttps } from '@/lib/install/addresses'
import { cn } from '@/lib/utils/cn'
import { SegmentedTabs } from '@/components/ui/segmented-tabs'
import { ContainerApplyStatus, ManualEnvSteps, SwitchButton, useContainerSettings, type ContainerSettings } from '@/components/install/container-settings'
import { Address, CopyLine, GuideList, InstallLoading, Note, QrImage, Steps, Ui, sectionClass, type GuideItem } from '@/components/install/guide'
import { fetchNetwork, useInstallData } from '@/components/install/use-install-data'
import { TEXT_BUTTON } from '@/components/updates/manual-commands'

const LINK = 'font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'
export const PROFILE_FILE = '/tazrim.mobileconfig'
export const CERT_FILE = '/tazrim-root.crt'

export function HttpsSettings({ inSetup, initial, network }: { inSetup?: boolean; initial?: InstallView; network?: NetworkInfo }) {
  const data = useInstallData(initial, network)
  if (!data.view || !data.network) return <InstallLoading failed={data.failed} retry={data.retry} plain={!!inSetup} />
  return <Https inSetup={!!inSetup} initial={data.view} network={data.network} />
}

/** A switch row: label and line on one side, the switch on the other; manual steps without the helper */
function SwitchRow({
  id,
  label,
  description,
  on,
  disabled,
  busy,
  onToggle,
  manualLine,
  settings,
}: {
  id: string
  label: string
  description: React.ReactNode
  on: boolean
  disabled: boolean
  busy: boolean
  onToggle: () => void
  manualLine: string
  settings: ContainerSettings
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="space-y-0.5">
          <span id={`${id}-label`} className="block text-sm font-medium">
            {label}
          </span>
          <span className="block text-xs text-muted-foreground text-pretty">{description}</span>
        </span>
        <SwitchButton on={on} labelledBy={`${id}-label`} busy={busy} disabled={!settings.canApply || settings.busy || disabled} onClick={onToggle} />
      </div>
      {!settings.canApply && <ManualEnvSteps lines={[manualLine]} installDir={settings.view.installDir} />}
    </div>
  )
}

/**
 * One downloadable file: its QR code (for a phone on the Wi-Fi) and a link (for this browser).
 * A card on the Settings page; in /setup's narrow card (`row`) a row: the text and link, the code beside.
 */
function DeviceFile({
  title,
  line,
  file,
  base,
  state,
  onRecheck,
  row = false,
}: {
  title: string
  line: string
  file: string
  /** http://<computer>:<phone port>, or null while the address is unknown */
  base: string | null
  state: 'off' | 'waiting' | 'ready'
  onRecheck: () => void
  row?: boolean
}) {
  const ready = state === 'ready'
  const info = (
    <span className="space-y-0.5">
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-muted-foreground">{line}</span>
    </span>
  )
  // On a phone the link is the way; the code is for a phone looking at a computer's screen
  const qr = (
    <span className="hidden shrink-0 sm:block" aria-hidden={!ready || undefined}>
      <QrImage url={ready && base ? base + file : null} size={row ? 88 : 128} label={`קוד QR להורדת ${file.slice(1)}`} />
    </span>
  )
  const action = (
    <span className={cn('flex min-h-11 flex-col justify-center text-xs text-muted-foreground', row ? 'items-start' : 'items-center')}>
      {state === 'ready' ? (
        <>
          <a href={file} download className={cn(TEXT_BUTTON, '-my-1', row && '-ms-3')}>
            הורדה
          </a>
          <bdi dir="ltr" className="break-all font-mono text-[11px]">
            {file.slice(1)}
          </bdi>
        </>
      ) : state === 'waiting' ? (
        <span className="flex items-center gap-1">
          האישור עוד נוצר.
          <button type="button" onClick={onRecheck} className={cn(TEXT_BUTTON, '-my-2 px-2')}>
            בדיקה שוב
          </button>
        </span>
      ) : (
        'זמין אחרי שמפעילים HTTPS'
      )}
    </span>
  )
  if (row) {
    return (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {info}
          {action}
        </div>
        {qr}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl surface px-3 py-4 text-center sm:p-5">
      {info}
      {qr}
      {action}
    </div>
  )
}

function Https({ inSetup, initial, network }: { inSetup: boolean; initial: InstallView; network: NetworkInfo }) {
  const settings = useContainerSettings(initial)
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

  const tazrimIp = ip || '192.168.1.20'
  const guides: GuideItem[] = [
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

  return (
    <div className="space-y-4">
      <section aria-labelledby="https-main" className={cn('space-y-4', sectionClass(inSetup))}>
        <div className="space-y-1">
          <h2 id="https-main" className="text-base font-semibold">
            הפעלה
          </h2>
          <p className="text-sm text-muted-foreground text-pretty">
            צריך קודם כתובת קבועה למחשב, אחרת זה יפסיק לעבוד כשהנתב יחליף אותה.{' '}
            <Link href="/settings/phones?guide=reserve" className={LINK}>
              איך שומרים כתובת קבועה
            </Link>
          </p>
          {!ip && (
            <p className="text-sm text-pretty">
              עוד לא ידוע מה הכתובת של המחשב. קובעים אותה ב
              <Link href="/settings/phones" className={LINK}>
                טלפונים וטאבלטים
              </Link>
              .
            </p>
          )}
        </div>

        <SwitchRow
          id="https-switch"
          label="HTTPS ושמות מקומיים"
          description="מפעיל במחשב הזה את Caddy (חיבור מוצפן) ואת AdGuard Home (השמות). משתמש בפורטים 80, 443 ו-53."
          on={on}
          disabled={!on && !ip}
          busy={profilesBusy}
          onToggle={() => void settings.apply({ COMPOSE_PROFILES: nextProfiles })}
          manualLine={`COMPOSE_PROFILES=${nextProfiles}`}
          settings={settings}
        />

        <div className={cn('space-y-0.5 rounded-xl bg-muted px-4 py-3 transition-opacity duration-fast', !on && 'opacity-50')}>
          <p className="text-xs text-muted-foreground">{on ? 'הכתובת המוצפנת' : 'הכתובת המוצפנת, אחרי ההפעלה'}</p>
          <Address url={url} className={inSetup ? 'text-base' : 'text-base sm:text-xl'} />
        </div>

        <SwitchRow
          id="https-lan-dns"
          label="שמות גם ל-Android ולמחשבים אחרים"
          description="פותח את ה-DNS של המחשב (פורט 53) לרשת הביתית. ל-iPhone ו-iPad לא צריך."
          on={on && lanDns}
          disabled={!on}
          busy={lanBusy}
          onToggle={() => void settings.apply({ TAZRIM_DNS_BIND: lanDns ? null : '0.0.0.0' })}
          manualLine={`TAZRIM_DNS_BIND=${lanDns ? '127.0.0.1' : '0.0.0.0'}`}
          settings={settings}
        />

        {settings.canApply &&
          (portBusy ? (
            <p aria-live="polite" className="min-h-5 text-xs text-destructive text-pretty">
              פורט 80, 443 או 53 תפוס בתוכנה אחרת במחשב, וההגדרה הקודמת חזרה. סוגרים את התוכנה, או קובעים ב-<bdi dir="ltr">.env</bdi> פורטים אחרים:{' '}
              <bdi dir="ltr" className="font-mono">
                TAZRIM_HTTP_PORT, TAZRIM_HTTPS_PORT, TAZRIM_DNS_PORT
              </bdi>
            </p>
          ) : (
            <ContainerApplyStatus settings={settings} />
          ))}
      </section>

      {inSetup ? (
        <section aria-label="קבצים להתקנה" className={cn('space-y-3', sectionClass(true))}>
          <DeviceFile row title="iPhone ו-iPad" line="פרופיל: האישור והשמות" file={PROFILE_FILE} base={base} state={fileState} onRecheck={recheck} />
          <DeviceFile row title="Android ומחשבים" line="האישור לבדו" file={CERT_FILE} base={base} state={fileState} onRecheck={recheck} />
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <DeviceFile title="iPhone ו-iPad" line="פרופיל: האישור והשמות" file={PROFILE_FILE} base={base} state={fileState} onRecheck={recheck} />
          <DeviceFile title="Android ומחשבים" line="האישור לבדו" file={CERT_FILE} base={base} state={fileState} onRecheck={recheck} />
        </div>
      )}

      <GuideList title="מדריכים" guides={guides} plain={inSetup} />

      {!inSetup && (
        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground text-pretty">
          <Laptop className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            במחשב הזה לא צריך כלום: ב-
            <bdi dir="ltr" className="font-mono">
              http://localhost:{values.TAZRIM_PORT}
            </bdi>{' '}
            גם מפתחות עובדים.
          </span>
        </p>
      )}
    </div>
  )
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
