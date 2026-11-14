'use client'

/**
 * Settings → Phones and tablets (ENG-122): the address a phone opens on the home Wi-Fi, with a
 * QR code; this computer's address, corrected through the helper; signing in from the phone;
 * and short guides (keep the address, find it, install as an app).
 *
 * /settings/phones passes `initial` and `network` from the server. /setup (ENG-125) renders
 * <PhonesSettings inSetup /> alone: the data then loads from /api/install and
 * /api/install/network (both need a session, which /setup has by then).
 */
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Laptop, Lock, MapPin, Search, Smartphone } from 'lucide-react'
import type { InstallView, NetworkInfo } from '@/lib/install/types'
import { phoneAddress } from '@/lib/install/addresses'
import { cn } from '@/lib/utils/cn'
import { ContainerApplyStatus, ContainerSettingField, useContainerSettings } from '@/components/install/container-settings'
import { Address, GuideList, InstallLoading, Note, QrImage, Steps, Ui, sectionClass, type GuideItem } from '@/components/install/guide'
import { useInstallData } from '@/components/install/use-install-data'

const LINK = 'font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded'

export function PhonesSettings({ inSetup, initial, network }: { inSetup?: boolean; initial?: InstallView; network?: NetworkInfo }) {
  const data = useInstallData(initial, network)
  if (!data.view || !data.network) return <InstallLoading failed={data.failed} retry={data.retry} plain={!!inSetup} />
  return <Phones inSetup={!!inSetup} initial={data.view} network={data.network} />
}

/** ?guide=reserve (from the HTTPS page) opens that guide */
function useGuideParam() {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => setId(new URLSearchParams(window.location.search).get('guide')), [])
  return id
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

function Phones({ inSetup, initial, network }: { inSetup: boolean; initial: InstallView; network: NetworkInfo }) {
  const settings = useContainerSettings(initial)
  const { values } = settings
  const address = phoneAddress(values)
  const guideParam = useGuideParam()
  const ip = values.TAZRIM_LAN_IP

  const guides: GuideItem[] = [
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
            {ip ? ' אם היא השתנתה, מתקנים אותה כאן.' : ''}
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
          <Note>כתובת ברשת ביתית מתחילה בדרך כלל ב-<bdi dir="ltr">192.168</bdi>, ב-<bdi dir="ltr">10.</bdi> או ב-<bdi dir="ltr">172.</bdi>. מקלידים אותה בשדה &quot;הכתובת של המחשב&quot; ושומרים.</Note>
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
            ב-Android, בכתובת <bdi dir="ltr">http</bdi> מתקבל רק קיצור דרך שנפתח בדפדפן. אפליקציה מלאה צריכה{' '}
            <Link href="/settings/https" className={LINK}>
              HTTPS
            </Link>
            . ב-iPhone ההוספה למסך הבית עובדת גם בכתובת <bdi dir="ltr">http</bdi>.
          </Note>
        </>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <section aria-labelledby="phones-address" className={cn('space-y-4', sectionClass(inSetup))}>
        <h2 id="phones-address" className="text-base font-semibold">
          הכתובת לטלפון
        </h2>
        <div className={cn('flex flex-col items-center gap-4', !inSetup && 'sm:flex-row sm:items-start')}>
          <div className={cn('w-full min-w-0 flex-1 space-y-2', !inSetup && 'sm:min-h-[164px]')}>
            {address ? (
              <>
                <Address url={address} className={inSetup ? 'text-lg' : 'text-xl sm:text-[28px]'} />
                <p className="text-sm text-muted-foreground text-pretty">בטלפון או בטאבלט, באותה רשת Wi-Fi: פותחים את הכתובת בדפדפן, או סורקים את הקוד במצלמה.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">עוד לא ידוע מה הכתובת של המחשב ברשת הביתית.</p>
                <p className="text-sm text-muted-foreground">מוצאים אותה בהגדרות הרשת של המחשב, ומקלידים אותה כאן למטה:</p>
                <div className="text-sm">
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
              </>
            )}
          </div>
          {/* The code's square stays whether or not there's an address */}
          <span className="hidden sm:block" aria-hidden={!address || undefined}>
            <QrImage url={address} size={148} label={`קוד QR לכתובת ${address ?? ''}`} />
          </span>
        </div>
        <ContainerSettingField
          settings={settings}
          name="TAZRIM_LAN_IP"
          label="הכתובת של המחשב ברשת הביתית"
          hint={address ? 'משתנה? שומרים לו כתובת קבועה בנתב (במדריך למטה), ומתקנים כאן.' : 'למשל 192.168.1.20'}
          placeholder="192.168.1.20"
          inputMode="decimal"
        />
        {settings.canApply && <ContainerApplyStatus settings={settings} />}
      </section>

      <section aria-labelledby="phones-signin" className={cn('space-y-2', sectionClass(inSetup))}>
        <h2 id="phones-signin" className="flex items-center gap-2 text-base font-semibold">
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
          כניסה מהטלפון
        </h2>
        {network.requireHttps ? (
          <p className="text-sm text-pretty">
            כרגע סיסמאות עובדות רק ב-HTTPS או במחשב הזה (
            <Link href="/settings/general" className={LINK}>
              כללי
            </Link>{' '}
            ← מתקדם). בכתובת שלמעלה הטלפון לא יוכל להיכנס עד שמפעילים{' '}
            <Link href="/settings/https" className={LINK}>
              HTTPS
            </Link>
            .
          </p>
        ) : (
          <p className="text-sm text-pretty">
            נכנסים עם שם וסיסמה. הכתובת היא <bdi dir="ltr">http</bdi>, אז הסיסמה עוברת ב-Wi-Fi בלי הצפנה. ברשת ביתית עם סיסמה זה בדרך כלל בסדר.
          </p>
        )}
        <p className="text-sm text-muted-foreground text-pretty">
          כניסה עם מפתח (Face ID או טביעת אצבע) עובדת בטלפון רק בחיבור מוצפן:{' '}
          <Link href="/settings/https" className={LINK}>
            HTTPS ומפתחות בטלפון
          </Link>
          .
        </p>
      </section>

      <GuideList title="מדריכים" guides={guides} openId={guideParam} plain={inSetup} />

      {!inSetup && (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Laptop className="h-3.5 w-3.5" aria-hidden />
          במחשב הזה תזרים פתוח בכתובת{' '}
          <bdi dir="ltr" className="font-mono">
            http://localhost:{values.TAZRIM_PORT}
          </bdi>
        </p>
      )}
    </div>
  )
}
