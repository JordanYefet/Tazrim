'use client'

import { useEffect, useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import overview from './gallery/overview.jpg'
import analysis from './gallery/analysis.jpg'
import projection from './gallery/projection.jpg'
import cards from './gallery/cards.jpg'
import { cn } from '@/lib/utils/cn'

/** Screenshots of the demo data (fake values), one per feature */
const SLIDES: { image: StaticImageData; title: string }[] = [
  { image: overview, title: 'סקירה כללית' },
  { image: analysis, title: 'ניתוח לפי קטגוריה' },
  { image: projection, title: 'תחזית' },
  { image: cards, title: 'כרטיסי אשראי' },
]

/** Where a screenshot sits by its distance from the front: front, behind left, behind right, hidden */
const POSES = [
  'z-30 opacity-100 [transform:none] shadow-[0_18px_44px_hsl(var(--shadow-color)/0.2)]',
  'z-20 opacity-90 [transform:translate(-13%,-8%)_rotate(-5deg)_scale(.88)] shadow-[0_16px_40px_hsl(var(--shadow-color)/0.14)]',
  'z-10 opacity-75 [transform:translate(13%,-11%)_rotate(5deg)_scale(.82)] shadow-[0_12px_30px_hsl(var(--shadow-color)/0.1)]',
  'z-0 opacity-0 [transform:translateY(-14%)_scale(.74)]',
]

/**
 * The sign-in page's story: a small fanned stack of screenshots, the front one
 * turning over every few seconds. Decorative:
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
    <div aria-hidden className="w-full py-6">
      <div className="relative aspect-[16/10] w-full">
        {SLIDES.map((s, i) => (
          <div
            key={s.title}
            className={cn(
              'absolute inset-0 overflow-hidden rounded-xl border border-white/70 bg-card transition-[transform,opacity,box-shadow] duration-[900ms] ease-spring will-change-transform motion-reduce:transition-none',
              POSES[(i - front + SLIDES.length) % SLIDES.length]
            )}
          >
            <Image src={s.image} alt="" fill sizes="(min-width: 1280px) 20rem, 0px" priority={i === 0} className="object-cover object-right-top" />
          </div>
        ))}
      </div>
    </div>
  )
}
