'use client'

import { useEffect, useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import overview from './gallery/overview.jpg'
import analysis from './gallery/analysis.jpg'
import projection from './gallery/projection.jpg'
import cards from './gallery/cards.jpg'
import { cn } from '@/lib/utils/cn'

/** Screenshots of the demo data (fake values), one per feature */
const SLIDES: { image: StaticImageData; title: string; body: string }[] = [
  { image: overview, title: 'סקירה כללית', body: 'הכנסות, הוצאות וחיובי כרטיס מכל החשבונות.' },
  { image: analysis, title: 'ניתוח לפי קטגוריה', body: 'לאן הולך הכסף, לפי קטגוריות ובתי עסק.' },
  { image: projection, title: 'תחזית', body: 'היתרה הצפויה עד סוף החודש.' },
  { image: cards, title: 'כרטיסי אשראי', body: 'כל העסקאות מכל הכרטיסים, במקום אחד.' },
]

/** Where a screenshot sits by its distance from the front: front, behind left, behind right, hidden */
const POSES = [
  'z-30 opacity-100 [transform:none] shadow-[0_30px_80px_hsl(var(--shadow-color)/0.24)]',
  'z-20 opacity-90 [transform:translate(-18%,-8%)_rotate(-5deg)_scale(.88)] shadow-[0_16px_40px_hsl(var(--shadow-color)/0.14)]',
  'z-10 opacity-75 [transform:translate(18%,-11%)_rotate(5deg)_scale(.82)] shadow-[0_12px_30px_hsl(var(--shadow-color)/0.1)]',
  'z-0 opacity-0 [transform:translateY(-14%)_scale(.74)]',
]

/**
 * The sign-in page's left side: a fanned stack of screenshots, the front one
 * turning over every few seconds, with its feature named under it. Decorative:
 * hidden from screen readers. Reduced motion: no turning.
 */
export function AppGallery() {
  const [front, setFront] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => {
      if (!document.hidden) setFront(i => (i + 1) % SLIDES.length)
    }, 4500)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div aria-hidden className="flex w-full max-w-[44rem] flex-col items-center gap-8">
      <div className="relative aspect-[16/10] w-[84%]">
        {SLIDES.map((s, i) => (
          <div
            key={s.title}
            className={cn(
              'absolute inset-0 overflow-hidden rounded-[18px] border border-white/70 bg-card transition-[transform,opacity,box-shadow] duration-[900ms] ease-spring will-change-transform motion-reduce:transition-none',
              POSES[(i - front + SLIDES.length) % SLIDES.length]
            )}
          >
            <Image src={s.image} alt="" fill sizes="(min-width: 1024px) 40vw, 0px" priority={i === 0} className="object-cover object-right-top" />
          </div>
        ))}
      </div>
      <div key={front} className="auth-swap space-y-1.5 text-center">
        <p className="text-[26px] font-bold tracking-tight">{SLIDES[front].title}</p>
        <p className="text-base text-muted-foreground">{SLIDES[front].body}</p>
      </div>
    </div>
  )
}
