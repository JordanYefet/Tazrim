'use client'

/**
 * Opening Tazrim from a phone (ENG-122): the address a phone opens on the home Wi-Fi and its QR
 * code, as one block; a quiet line on passwords over http; the phone guides (keep the address,
 * find it, install as an app).
 *
 * Settings → Phones and network (/settings/network) renders <PhoneSection> as its first section,
 * with the page's one settings object. /setup (ENG-125) renders <PhonesSettings inSetup /> alone:
 * the data then loads from /api/install and /api/install/network (both need a session, which
 * /setup has by then), and it shows only the essentials: the block and the guide to keep the address.
 */
import Link from 'next/link'
import { MapPin, Search, Smartphone } from 'lucide-react'
import type { InstallView, NetworkInfo } from '@/lib/install/types'
import { phoneAddress } from '@/lib/install/addresses'
import { cn } from '@/lib/utils/cn'
import { ContainerApplyStatus, ContainerSettingField, useContainerSettings, type ContainerSettings } from '@/components/install/container-settings'
import {
  AddressLine,
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
import { useInstallData } from '@/components/install/use-install-data'

export const LINK =
  'font-medium text-primary underline-offset-4 hover-fine:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'

/** The page these sections live on, and its anchors */
export const NETWORK_PAGE = '/settings/network'

export function PhonesSettings({ inSetup, initial, network }: { inSetup?: boolean; initial?: InstallView; network?: NetworkInfo }) {
  const data = useInstallData(initial, network)
  if (!data.view || !data.network) return <InstallLoading failed={data.failed} retry={data.retry} plain={!!inSetup} />
  return <Phones inSetup={!!inSetup} initial={data.view} network={data.network} />
}

/** On its own (/setup, tests): the section, then its guides (in /setup only the one to keep the address) */
function Phones({ inSetup, initial, network }: { inSetup: boolean; initial: InstallView; network: NetworkInfo }) {
  const settings = useContainerSettings(initial)
  const guides = phoneGuides(settings.values.TAZRIM_LAN_IP)
  const [open, setOpen] = useOpenGuide(guides)
  return (
    <div className="space-y-4">
      <PhoneSection settings={settings} network={network} inSetup={inSetup} />
      {inSetup ? (
        <GuideList plain groups={[{ title: 'מדריך', guides: guides.filter(g => g.id === 'reserve') }]} onOpen={setOpen} />
      ) : (
        <GuideList title="מדריכים" groups={[{ title: 'הטלפון', guides }]} onOpen={setOpen} />
      )}
      <GuideWindow guides={guides} open={open} onClose={() => setOpen(null)} />
    </div>
  )
}

/** Mac and Windows: where this computer's address is */
function FindAddressSteps() {
  return (
    <ul className="space-y-1.5">
      <li className="text-pretty">
        <span className="font-medium">Mac:</span> הגדרות המערכת ← <Ui ltr>Wi-Fi</Ui> ← <Ui>פרטים</Ui> ליד הרשת המחוברת ← <Ui>כתובת IP</Ui>.
      </li>
      <li className="text-pretty">
        <span className="font-medium">Windows:</span> הגדרות ← רשת ואינטרנט ← <Ui ltr>Wi-Fi</Ui> (או <Ui ltr>Ethernet</Ui>) ← המאפיינים של הרשת ← <Ui>כתובת IPv4</Ui>.
      </li>
    </ul>
  )
}

/** The phone guides: keep the address, find it, install as an app */
export function phoneGuides(ip: string): GuideItem[] {
  return [
    {
      id: 'reserve',
      icon: MapPin,
      title: 'שהכתובת לא תשתנה',
      summary: 'שומרים למחשב את הכתובת שלו בנתב, פעם אחת.',
      body: (
        <>
          <p className="text-pretty">הנתב נותן כתובת לכל מכשיר בבית, ולפעמים מחליף אותה. כששומרים למחשב את הכתובת שלו, הכתובת של תזרים נשארת קבועה.</p>
          <Steps>
            <li>
              פותחים בדפדפן את עמוד הניהול של הנתב. הכתובת והסיסמה כתובות בדרך כלל על מדבקה על הנתב (למשל <bdi dir="ltr">192.168.1.1</bdi>). לחלק מהנתבים יש אפליקציה, ואז ההגדרה נמצאת בה.
            </li>
            <li>
              מחפשים הגדרה בשם <Ui ltr>DHCP Reservation</Ui>, <Ui ltr>Address Reservation</Ui> או <Ui ltr>Static Lease</Ui>. היא נמצאת בדרך כלל תחת <Ui ltr>LAN</Ui> או <Ui ltr>DHCP</Ui>.
            </li>
            <li>
              בוחרים את המחשב הזה מרשימת המכשירים{ip ? (
                <>
                  , עם הכתובת <bdi dir="ltr" className="font-mono">{ip}</bdi>
                </>
              ) : null}
              .
            </li>
            <li>שומרים.</li>
          </Steps>
          <Note>
            בדיקה: מפעילים מחדש את הנתב או את המחשב, ובודקים שלמחשב יש אותה כתובת (איך מוצאים אותה: במדריך &quot;איפה הכתובת של המחשב&quot;).
            {ip ? ' אם היא השתנתה, מתקנים אותה בהגדרות ← טלפונים ורשת ← מתקדם.' : ''}
          </Note>
        </>
      ),
    },
    {
      id: 'find',
      icon: Search,
      title: 'איפה הכתובת של המחשב',
      summary: 'ב-Mac וב-Windows, בהגדרות הרשת.',
      body: (
        <>
          <p className="text-pretty">הכתובת של המחשב ברשת הביתית נמצאת בהגדרות הרשת שלו:</p>
          <FindAddressSteps />
          <Note>
            כתובת ברשת ביתית מתחילה בדרך כלל ב-<bdi dir="ltr">192.168</bdi>, ב-<bdi dir="ltr">10.</bdi> או ב-<bdi dir="ltr">172.</bdi>. מקלידים אותה בשדה &quot;הכתובת של המחשב&quot; ושומרים.
          </Note>
        </>
      ),
    },
    {
      id: 'app',
      icon: Smartphone,
      title: 'התקנה כאפליקציה בטלפון',
      summary: 'אייקון במסך הבית, בלי סרגל הדפדפן.',
      body: (
        <>
          <ul className="space-y-1.5">
            <li className="text-pretty">
              <span className="font-medium">iPhone ו-iPad (Safari):</span> כפתור השיתוף ← <Ui>הוספה למסך הבית</Ui>. האפליקציה נפתחת במסך מלא.
            </li>
            <li className="text-pretty">
              <span className="font-medium">Android (Chrome):</span> מאשרים את הצעת ההתקנה, או מתפריט הדפדפן (⋮) ← <Ui>התקנת האפליקציה</Ui> או <Ui>הוספה למסך הבית</Ui>.
            </li>
          </ul>
          <Note>
            ב-Android, בכתובת <bdi dir="ltr">http</bdi> מתקבל רק קיצור דרך שנפתח בדפדפן. אפליקציה מלאה צריכה חיבור מוצפן (HTTPS). ב-iPhone ההוספה למסך הבית עובדת גם בכתובת <bdi dir="ltr">http</bdi>.
          </Note>
        </>
      ),
    },
  ]
}

/**
 * The address and its QR code as one block: on one side the address with its copy button and a
 * line on what to do, on the other the code, both centred; stacked on a narrow screen (where the
 * code would be scanned by the very phone showing it, so it is left out). Then one quiet line on
 * passwords over http, with the way to HTTPS.
 */
export function PhoneSection({ settings, network, inSetup = false }: { settings: ContainerSettings; network: NetworkInfo; inSetup?: boolean }) {
  const { values } = settings
  const address = phoneAddress(values)

  return (
    <section id={inSetup ? undefined : 'phones'} aria-labelledby={inSetup ? undefined : 'phones-title'} aria-label={inSetup ? 'הכתובת לטלפון' : undefined} className={cn('scroll-mt-6 space-y-4', sectionClass(inSetup))}>
      {!inSetup && <SectionHeading id="phones-title">פתיחה מהטלפון</SectionHeading>}
      <div className="flex items-center gap-5">
        <div className="min-w-0 flex-1 space-y-2">
          {address ? (
            <>
              <AddressLine url={address} className={inSetup ? 'text-[1.0625rem] sm:text-xl' : 'text-[1.0625rem] sm:text-[1.625rem]'} />
              <p className="text-sm text-muted-foreground text-pretty">
                <span className="hidden sm:inline">בטלפון או בטאבלט, באותה רשת Wi-Fi: סורקים את הקוד במצלמה, או מקלידים את הכתובת בדפדפן.</span>
                <span className="sm:hidden">בטלפון או בטאבלט, באותה רשת Wi-Fi: פותחים את הכתובת בדפדפן.</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">עוד לא ידוע מה הכתובת של המחשב ברשת הביתית.</p>
              <div className="text-sm text-muted-foreground">
                <FindAddressSteps />
              </div>
              {network.lanHints.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  כתובות שנמצאו במחשב הזה:{' '}
                  {network.lanHints.map((h, i) => (
                    <span key={h}>
                      {i > 0 && ', '}
                      <bdi dir="ltr" className="select-all font-mono text-foreground">
                        {h}
                      </bdi>
                    </span>
                  ))}
                </p>
              )}
              {!inSetup && (
                <p className="text-sm text-pretty">
                  מקלידים אותה ב
                  <Link href={`${NETWORK_PAGE}#advanced`} className={LINK}>
                    מתקדם
                  </Link>
                  , למטה.
                </p>
              )}
            </>
          )}
        </div>
        {/* The code's square stays whether or not there's an address */}
        <span className="hidden sm:block" aria-hidden={!address || undefined}>
          <QrImage url={address} size={inSetup ? 120 : 136} label={`קוד QR לכתובת ${address ?? ''}`} />
        </span>
      </div>

      {inSetup && !values.TAZRIM_LAN_IP && (
        <>
          <ContainerSettingField
            settings={settings}
            name="TAZRIM_LAN_IP"
            label="הכתובת של המחשב ברשת הביתית"
            hint="למשל 192.168.1.20"
            placeholder="192.168.1.20"
            inputMode="decimal"
          />
          {settings.canApply && <ContainerApplyStatus settings={settings} only={['TAZRIM_LAN_IP']} />}
        </>
      )}

      <p className="border-t pt-3 text-[0.8125rem] text-muted-foreground text-pretty">
        {network.requireHttps ? (
          <>
            כרגע סיסמאות עובדות רק ב-HTTPS או במחשב הזה (כללי ← מתקדם), אז בכתובת הזו הטלפון לא ייכנס עד שמפעילים{' '}
            {inSetup ? 'חיבור מוצפן, בשלב הבא.' : <HttpsLink />}
          </>
        ) : (
          <>
            הכתובת היא <bdi dir="ltr">http</bdi>, אז הסיסמה עוברת ב-Wi-Fi בלי הצפנה. בבית זה בדרך כלל בסדר. לכניסה עם Face ID צריך{' '}
            {inSetup ? 'חיבור מוצפן, בשלב הבא.' : <HttpsLink />}
          </>
        )}
      </p>
    </section>
  )
}

function HttpsLink() {
  return (
    <>
      <Link href={`${NETWORK_PAGE}#https`} className={LINK}>
        חיבור מוצפן
      </Link>
      .
    </>
  )
}
